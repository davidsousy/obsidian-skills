// Traduz mensagens do Supabase/Postgres para o usuário.
const translations: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/user already registered/i, "Este e-mail já tem conta. Use “Entrar”."],
  [/password should be at least/i, "A senha precisa ter pelo menos 6 caracteres."],
  [/unable to validate email|invalid email/i, "E-mail inválido."],
  [/email not confirmed/i, "Confirme o e-mail antes de entrar (veja sua caixa de entrada)."],
  [
    /email address not authorized|error sending confirmation email|error sending .*email/i,
    "O Supabase não conseguiu enviar o e-mail de confirmação (o envio gratuito só funciona para a equipe do projeto). " +
      "No Supabase, desligue “Confirm email” em Authentication → Sign In / Providers → Email e tente de novo.",
  ],
  [/signups? not allowed|signup is disabled/i, "O cadastro de novas contas está desligado no Supabase (Authentication → Sign In / Providers)."],
  [/rate limit/i, "Muitas tentativas. Aguarde um pouco e tente de novo."],
];

export function friendlyError(message: string | undefined): string {
  if (!message) return "Algo deu errado. Tente de novo.";
  for (const [pattern, text] of translations) if (pattern.test(message)) return text;
  // Exceções das nossas funções SQL já estão em português.
  return message;
}

export function withParam(path: string, key: "erro" | "ok", message: string): string {
  return `${path}?${key}=${encodeURIComponent(message)}`;
}
