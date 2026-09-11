/**
 * Password rules, kept apart from the hashing implementation.
 *
 * The signup form needs the minimum length; importing it from the module that
 * pulls in bcrypt would ship the whole hashing library to the browser.
 */
export const PASSWORD_MIN_LENGTH = 10
