// Mismas reglas que el backend (app/security.py)
export const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'Mínimo 8 caracteres' },
  { test: (p) => /[A-Z]/.test(p), label: '1 letra mayúscula' },
  { test: (p) => /[a-z]/.test(p), label: '1 letra minúscula' },
  { test: (p) => /\d/.test(p), label: '1 número' },
]

export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p))
