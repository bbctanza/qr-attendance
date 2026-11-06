/**
 * Password quality checks for account setup.
 *
 * Onboarding previously accepted any six characters, which let an invited administrator
 * secure an account that can delete every attendance record with "123456". The rules here
 * are deliberately about what actually gets guessed - length, reuse of the person's own
 * email, and the handful of passwords that top every breach list - rather than the
 * character-class theatre that mostly produces "Password1!".
 */

export const MIN_PASSWORD_LENGTH = 10;

/** Compared case-insensitively, after stripping non-alphanumerics. */
const COMMON_PASSWORDS = [
	'password',
	'passw0rd',
	'123456',
	'12345678',
	'123456789',
	'qwerty',
	'qwertyuiop',
	'letmein',
	'welcome',
	'admin',
	'administrator',
	'iloveyou',
	'monkey',
	'dragon',
	'football',
	'baseball',
	'sunshine',
	'princess',
	'abc123',
	'changeme',
	'attendance',
	'church'
];

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordAssessment {
	/** Whether the password may be submitted at all. */
	acceptable: boolean;
	strength: PasswordStrength;
	/** 0-4, for the meter. */
	score: number;
	/** The single most useful thing to fix, or null when there's nothing left to say. */
	hint: string | null;
}

function normalize(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function assessPassword(password: string, email = ''): PasswordAssessment {
	if (!password) {
		return { acceptable: false, strength: 'weak', score: 0, hint: null };
	}

	if (password.length < MIN_PASSWORD_LENGTH) {
		return {
			acceptable: false,
			strength: 'weak',
			score: password.length >= 6 ? 1 : 0,
			hint: `Use at least ${MIN_PASSWORD_LENGTH} characters — ${MIN_PASSWORD_LENGTH - password.length} to go.`
		};
	}

	const normalized = normalize(password);

	for (const common of COMMON_PASSWORDS) {
		if (normalized.includes(common)) {
			return {
				acceptable: false,
				strength: 'weak',
				score: 0,
				hint: `"${common}" appears in every password-guessing list. Pick something else.`
			};
		}
	}

	// The local part of their own address is the first thing an attacker tries.
	const localPart = normalize(email.split('@')[0] ?? '');
	if (localPart.length >= 4 && normalized.includes(localPart)) {
		return {
			acceptable: false,
			strength: 'weak',
			score: 0,
			hint: 'Avoid using your email address in your password.'
		};
	}

	// A single repeated or sequential run is the other common shape ("aaaaaaaaaa", "abcdefghij").
	if (/^(.)\1+$/.test(password)) {
		return {
			acceptable: false,
			strength: 'weak',
			score: 0,
			hint: 'A single repeated character is not a password.'
		};
	}

	let score = 1;
	if (password.length >= 12) score++;
	if (password.length >= 16) score++;

	const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
		re.test(password)
	).length;
	if (classes >= 3) score++;

	// A long passphrase is strong whatever its character classes, so cap rather than require.
	score = Math.min(4, score);

	const strength: PasswordStrength =
		score >= 4 ? 'strong' : score === 3 ? 'good' : score === 2 ? 'fair' : 'weak';

	let hint: string | null = null;
	if (strength === 'weak' || strength === 'fair') {
		hint = 'Longer is stronger. A few unrelated words beats a short, complicated one.';
	}

	return { acceptable: true, strength, score, hint };
}

export const STRENGTH_LABELS: Record<PasswordStrength, string> = {
	weak: 'Too weak',
	fair: 'Fair',
	good: 'Good',
	strong: 'Strong'
};
