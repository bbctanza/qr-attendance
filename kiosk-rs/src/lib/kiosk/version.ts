/**
 * The app version, for the About screen.
 *
 * `__APP_VERSION__` is a build-time replacement injected by vite from package.json, so it is
 * never retyped and cannot drift from what ships. The guard matters: a `define` only applies
 * to a build, so a dev server already running when the config changed has no such global, and
 * referencing it bare throws a ReferenceError that takes the whole About panel down with it.
 * `typeof` on an undeclared name is safe, which is what makes this a fallback rather than a
 * second crash.
 */
export const APP_VERSION: string =
	typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
