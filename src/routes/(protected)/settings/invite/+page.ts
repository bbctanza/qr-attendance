import { redirect } from '@sveltejs/kit';

/**
 * "Manage Staff" became the Access Directory at /settings/access.
 *
 * The old path is kept as a permanent redirect rather than deleted: it is linked from
 * earlier changelog entries, and admins bookmark the page they use to add colleagues.
 */
export const load = () => {
	redirect(308, '/settings/access');
};
