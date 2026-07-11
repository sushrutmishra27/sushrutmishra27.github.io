import { compareSync } from "bcryptjs";

// The password is never stored here — only its bcrypt "hash" (a one-way
// scramble). Typing the right password produces a match; reading this file
// does not reveal the password itself.
//
// To change the password: run
//   node -e "console.log(require('bcryptjs').hashSync('YOUR-NEW-PASSWORD', 10))"
// and paste the result over the string below.
const PASSWORD_HASH =
  "$2b$10$0FlWfykVdGFD17f8iN1Uj.vL/guwgpAaohtWp7RrgUgf.FjUNpNLO";

const AUTH_FLAG = "sunimuni-auth";

export function checkPassword(input: string): boolean {
  return compareSync(input, PASSWORD_HASH);
}

// sessionStorage lives only for the browser tab's lifetime — closing the tab
// "logs out". That's the intended behavior for this site.
export function setAuthed(): void {
  sessionStorage.setItem(AUTH_FLAG, "1");
}

export function isAuthed(): boolean {
  return sessionStorage.getItem(AUTH_FLAG) === "1";
}
