import { hashPassword } from "../src/lib/auth/password.ts";

const password = process.env.APP_PASSWORD_SETUP;
if (!password) throw new Error("Set APP_PASSWORD_SETUP for this command only; it will not be written to disk.");
console.log(hashPassword(password));
