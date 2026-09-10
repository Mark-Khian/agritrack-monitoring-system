const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_COST = 12;
const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_BYTES = 72;
const TEMP_PASSWORD_LENGTH = 24;

const utf8Length = (value) => Buffer.byteLength(value, 'utf8');

const validateStrongPassword = (password) => {
    if (typeof password !== 'string') {
        return 'Password is required.';
    }
    if (password.length < MIN_PASSWORD_CHARACTERS) {
        return `Password must be at least ${MIN_PASSWORD_CHARACTERS} characters.`;
    }
    if (utf8Length(password) > MAX_PASSWORD_BYTES) {
        return `Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes.`;
    }
    if (!/[a-z]/.test(password)) {
        return 'Password must contain a lowercase letter.';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must contain an uppercase letter.';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain a number.';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return 'Password must contain a symbol.';
    }
    return null;
};

const secureIndex = (upperBound) => crypto.randomInt(0, upperBound);

const shuffle = (characters) => {
    for (let index = characters.length - 1; index > 0; index -= 1) {
        const swapIndex = crypto.randomInt(0, index + 1);
        [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }
    return characters;
};

const generateTemporaryPassword = () => {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!@#$%^&*()-_=+';
    const all = lower + upper + digits + symbols;
    const characters = [
        lower[secureIndex(lower.length)],
        upper[secureIndex(upper.length)],
        digits[secureIndex(digits.length)],
        symbols[secureIndex(symbols.length)]
    ];

    while (characters.length < TEMP_PASSWORD_LENGTH) {
        characters.push(all[secureIndex(all.length)]);
    }

    return shuffle(characters).join('');
};

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);
const comparePassword = (password, hash) => bcrypt.compare(password, hash);

module.exports = {
    BCRYPT_COST,
    MAX_PASSWORD_BYTES,
    validateStrongPassword,
    generateTemporaryPassword,
    hashPassword,
    comparePassword
};
