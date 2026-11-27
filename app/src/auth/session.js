// Gerência do token de sessão (HMAC) emitido pelo backend no login.
export const getSessionToken = () => sessionStorage.getItem("sessionToken") || "";
export const setSessionToken = (t) => sessionStorage.setItem("sessionToken", t || "");
export const clearSessionToken = () => sessionStorage.removeItem("sessionToken");

// Sufixo de sessão do Apps Script antigo (sem uso desde 23/11/2026).
export const sessionParam = () => `&session=${encodeURIComponent(getSessionToken())}`;

// Injeta a sessão num corpo de POST.
export const withSession = (body) => ({ ...body, session: getSessionToken() });
