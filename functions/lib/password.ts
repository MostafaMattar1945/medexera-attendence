export const PASSWORD_ITERATIONS = 100_000;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  if (!salt || !expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  return (await hashPassword(password, salt)) === expected.toLowerCase();
}
