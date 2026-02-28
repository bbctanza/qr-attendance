import { supabase } from '$lib/supabase';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	// Get the current user session
	const {
		data: { session }
	} = await supabase.auth.getSession();

	if (!session) {
		redirect(303, '/login');
	}

	// Get user's role from profiles table
	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', session.user.id)
		.single();

	// Only allow admin and developer roles
	if (!profile || !['admin', 'developer'].includes(profile.role)) {
		redirect(303, '/analytics');
	}

	return {
		session
	};
};
