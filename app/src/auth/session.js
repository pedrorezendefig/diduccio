// Gerência do token de sessão (HMAC) emitido pelo backend no login.
export const getSessionToken = () => sessionStorage.getItem("sessionToken") || "";
export const setSessionToken = (t) => sessionStorage.setItem("sessionToken", t || "");
export const clearSessionToken = () => sessionStorage.removeItem("sessionToken");

// Sufixo para anexar a URLs GET: `${API_URL}?token=...${sessionParam()}`
export const sessionParam = () => `&session=${encodeURIComponent(getSessionToken())}`;

// Injeta a sessão num corpo de POST.
export const withSession = (body) => ({ ...body, session: getSessionToken() });
