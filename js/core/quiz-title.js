export function quizTitle(value, questions = []) {
  const lines = String(value || '').split('\n').map(line => line.replace(/^#+\s*/, '').trim());
  const explicit = lines.find(line => /^(?:T[ií]tulo|Simulado)\s*:/i.test(line));
  if (explicit) return explicit.replace(/^T[ií]tulo\s*:\s*/i, '').slice(0, 120);
  const candidate = lines[0] || '';
  if (candidate && candidate.length <= 120 && !/^(?:ol[aá]|claro|como professor|voc[eê] [eé]|aqui est|elaborei|temas?\s*:)/i.test(candidate)) return candidate;
  const topics = [...new Set(questions.map(q => q?.topic).filter(t => t && t !== 'Não informado'))];
  return topics.length ? `Simulado: ${topics.slice(0, 2).join(' · ')}`.slice(0,120) : 'Simulado de questões médicas';
}
