'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

// zod object giving schema of an invoice
const FormSchema = z.object({
	id: z.string(),
	customerId: z.string({
		required_error: 'Please select a customer',
	}),
	amount: z.coerce
		.number()
		.gt(0, { message: 'Please enter a number greater than $0.' }),
	status: z.enum(['pending', 'paid'], {
		required_error: 'Please select an invoice status.',
	}),
	date: z.string(),
});

// we don't need the id or date from the form. id is passed to the server action
// while date is generated in the server action
const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

// declare the state of the server action
export type State = {
	errors?: {
		customerId?: string[];
		amount?: string[];
		status?: string[];
	};
	message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
	// const rawFormData = {
	// 	customerId: formData.get('customerId'),
	// 	amount: formData.get('amount'),
	// 	status: formData.get('status'),
	// };
	const rawFormData = Object.fromEntries(formData.entries());

	// safe parse to handle errors gracefully
	const validatedFields = CreateInvoice.safeParse(rawFormData);

	console.log('validatedFields', validatedFields);

	// if form validation fails, return early
	if (!validatedFields.success) {
		return {
			status: 500,
			errors: validatedFields.error.flatten().fieldErrors,
			message: 'Missing fields. Failed to Create Invoice.',
		};
	}

	// prepare data for insertion
	const { amount, customerId, status } = validatedFields.data;
	const amountInCents = amount * 100;
	const date = new Date().toISOString().split('T')[0];

	// insert data into database
	try {
		await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
	} catch (err) {
		return {
			message: 'Database error: failed to create invoice',
		};
	}
	revalidatePath('/dashboard/invoices');
	redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, formData: FormData) {
	const rawFormData = Object.fromEntries(formData.entries());
	const { customerId, amount, status } = UpdateInvoice.parse(rawFormData);
	const amountInCents = amount * 100;

	try {
		await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
      revalidatePath('/dashboard/invoices');
      redirect('/dashboard/invoices');
  `;
	} catch (err) {
		return {
			message: 'Database error: failed to updated invoice',
		};
	}
	revalidatePath('/dashboard/invoices');
	redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
	try {
		await sql`DELETE FROM invoices WHERE id = ${id}`;
		revalidatePath('/dashboard/invoices');
		return { message: 'Deleted invoice.' };
	} catch (err) {
		return {
			message: 'Database Error: failed to delete invoice',
		};
	}
}

export async function authenticate(
	prevState: string | undefined,
	formData: FormData,
) {
	try {
		await signIn('credentials', formData);
	} catch (error) {
		if (error instanceof AuthError) {
			switch (error.type) {
				case 'CredentialsSignin':
					return 'Invalid credentials';
				default:
					return 'Something went wrong';
			}
		}
		throw error;
	}
}
