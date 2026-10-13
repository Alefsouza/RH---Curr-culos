/**
 * Utilitários para extração e pós-processamento determinístico de CNH / Habilitação.
 * Reconhece padrões comuns em currículos brasileiros:
 * - "Habilitação: Categoria D"
 * - "CNH: AB", "CNH Categoria D/E", "CNH: D", "CNH: E"
 * - "Carteira Nacional de Habilitação", "Carteira de habilitação: Cat D"
 * - "Possui CNH D", "Categoria AD", "Categoria AE"
 * - Cursos complementares de condução como "MOPP", "EAR", "Transporte Coletivo"
 */

export interface ExtractedCnh {
  cnh: string | null // ex: "Categoria D", "AB", "D", "E"
  cnh_categoria: string | null // ex: "D", "E", "AB", "AD", "AE", "B", "A"
  possui_cnh?: boolean
}

/**
 * Normaliza e padroniza a categoria da CNH (ex: "Categoria D" -> "D", "AD" -> "AD").
 */
export function normalizeCnhCategory(cat: string | null | undefined): string | null {
  if (!cat) return null
  const cleaned = cat
    .toUpperCase()
    .replace(/CATEGORIA\s*/i, '')
    .replace(/CAT\.?\s*/i, '')
    .replace(/CNH\s*/i, '')
    .replace(/[\/,\-\s]+/g, '')
    .trim()

  // Se for categoria composta válida (ex: AB, AC, AD, AE) ou simples (A, B, C, D, E)
  if (/^[A-E]{1,2}$/.test(cleaned)) {
    return cleaned
  }
  return cat.trim()
}

/**
 * Extrai informações de CNH a partir de texto bruto (OCR ou texto nativo) via Regex determinístico.
 * Serve como fallback quando a IA não preencher os campos `cnh` / `cnh_categoria`.
 */
export function extractCnhFromText(text: string | null | undefined): ExtractedCnh {
  const result: ExtractedCnh = {
    cnh: null,
    cnh_categoria: null,
    possui_cnh: false,
  }

  if (!text || typeof text !== 'string') return result

  // Remove quebras de linha excessivas e normaliza espaços
  const normalized = text.replace(/[\r\n]+/g, ' \n ')

  // 1. Padrão explícito de "Habilitação" ou "CNH" ou "Carteira ... Habilitação" seguido de categoria
  // Ex: "Habilitação: Categoria D", "Habilitação: D", "CNH: Categoria AB", "CNH: D/E", "Carteira de Habilitação: Cat. D"
  const explicitCnhRegex =
    /(?:habilita[çc][ãa]o|cnh|carteira\s+(?:nacional\s+de\s+)?habilita[çc][ãa]o)\s*[:\-–—]?\s*(?:categoria|cat\.?)?\s*[:\-–—]?\s*([a-e]{1,2}(?:\s*(?:\/|ou|e)\s*[a-e]{1,2})?|\b[a-e]\b)/i

  const matchExplicit = normalized.match(explicitCnhRegex)
  if (matchExplicit && matchExplicit[1]) {
    const rawCat = matchExplicit[1].trim()
    result.possui_cnh = true
    result.cnh = `Categoria ${rawCat.toUpperCase()}`
    result.cnh_categoria = normalizeCnhCategory(rawCat)
    return result
  }

  // 2. Padrão "Categoria [A-E]" ou "Cat. [A-E]" isolado ou após CNH
  // Ex: "Categoria D", "Categoria AD", "Categoria D/E", "Cat D"
  const catRegex =
    /\b(?:categoria|cat\.?)\s*[:\-–—]?\s*([a-e]{1,2}(?:\s*(?:\/|ou|e)\s*[a-e]{1,2})?|\b[a-e]\b)(?:\s+(?:ear|mopp|transporte\s+coletivo))?/i

  const matchCat = normalized.match(catRegex)
  if (matchCat && matchCat[1]) {
    const rawCat = matchCat[1].trim()
    result.possui_cnh = true
    result.cnh = `Categoria ${rawCat.toUpperCase()}`
    result.cnh_categoria = normalizeCnhCategory(rawCat)
    return result
  }

  // 3. Padrão "CNH [A-E]" ou "CNH: [A-E]"
  // Ex: "CNH D", "CNH E", "CNH B", "CNH AD"
  const cnhSimpleRegex = /\bcnh\s*[:\-–—]?\s*([a-e]{1,2})\b/i
  const matchSimple = normalized.match(cnhSimpleRegex)
  if (matchSimple && matchSimple[1]) {
    const rawCat = matchSimple[1].trim()
    result.possui_cnh = true
    result.cnh = `Categoria ${rawCat.toUpperCase()}`
    result.cnh_categoria = normalizeCnhCategory(rawCat)
    return result
  }

  // 4. Padrão "Possui CNH" ou "Possui Carteira de Motorista" com ou sem categoria
  const possuiCnhRegex =
    /\bpossui\s+(?:cnh|habilita[çc][ãa]o|carteira\s+de\s+motorista)(?:\s+(?:categoria\s+)?([a-e]{1,2}))?\b/i
  const matchPossui = normalized.match(possuiCnhRegex)
  if (matchPossui) {
    result.possui_cnh = true
    if (matchPossui[1]) {
      const rawCat = matchPossui[1].trim()
      result.cnh = `Categoria ${rawCat.toUpperCase()}`
      result.cnh_categoria = normalizeCnhCategory(rawCat)
    } else {
      result.cnh = 'Possui CNH'
    }
    return result
  }

  return result
}

/**
 * Mescla os dados extraídos pela IA com os dados descobertos pelo regex determinístico de CNH.
 * Se a IA já tiver cnh ou cnh_categoria preenchidos, preserva-os ou aprimora-os.
 * Se a IA não tiver preenchido (ou for null/vazio), usa o resultado do fallback via regex sobre o texto nativo e OCR.
 */
export function mergeExtractedCnh(currentData: any, rawTexts: (string | null | undefined)[]): any {
  if (!currentData || typeof currentData !== 'object') {
    currentData = {}
  }

  // Se a IA já extraiu cnh_categoria ou cnh
  let cnh = currentData.cnh || currentData.habilitacao || currentData.categoria_cnh || null
  let cnh_categoria = currentData.cnh_categoria || currentData.categoria || null

  // Normaliza o que já existe se presente
  if (cnh_categoria) {
    cnh_categoria = normalizeCnhCategory(String(cnh_categoria))
  }
  if (!cnh && cnh_categoria) {
    cnh = `Categoria ${cnh_categoria}`
  }

  // Se faltar cnh ou cnh_categoria, tenta extrair dos textos brutos disponíveis
  if (!cnh || !cnh_categoria) {
    for (const t of rawTexts) {
      if (!t) continue
      const found = extractCnhFromText(t)
      if (found.cnh_categoria) {
        if (!cnh_categoria) cnh_categoria = found.cnh_categoria
        if (!cnh) cnh = found.cnh
        break
      } else if (found.cnh && !cnh) {
        cnh = found.cnh
      }
    }
  }

  // Também verifica se em 'skills' ou 'formacao_academica' do JSON há menção explícita a CNH D/E/etc.
  if (!cnh || !cnh_categoria) {
    const listToCheck: string[] = []
    if (Array.isArray(currentData.skills)) listToCheck.push(...currentData.skills)
    if (Array.isArray(currentData.formacao_academica))
      listToCheck.push(...currentData.formacao_academica)
    if (typeof currentData.resumo_cv === 'string') listToCheck.push(currentData.resumo_cv)

    for (const item of listToCheck) {
      if (typeof item !== 'string') continue
      const found = extractCnhFromText(item)
      if (found.cnh_categoria) {
        if (!cnh_categoria) cnh_categoria = found.cnh_categoria
        if (!cnh) cnh = found.cnh
        break
      }
    }
  }

  return {
    ...currentData,
    cnh: cnh || null,
    cnh_categoria: cnh_categoria || null,
  }
}
