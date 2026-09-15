// Helper para cálculo de distância Haversine e geocodificação de proximidade geográfica
// Define localizações de referência (Cursino e Sapopemba), cálculo Haversine e resolução de coordenadas

export interface Coordinates {
  lat: number
  lng: number
}

// Extrai padrão de CEP brasileiro (ex: "03938-050", "03938050")
export function extractCep(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null
  const match = text.match(/\b(\d{5})[-.\s]?(\d{3})\b/)
  if (match) {
    return `${match[1]}-${match[2]}`
  }
  return null
}

// Sanitiza strings de endereço removendo "n°", "nº", "nr.", "número", "s/n", etc.
// para evitar falhas ou erros de posicionamento na Geocoding API do Google.
export function sanitizeAddressString(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return ''

  let cleaned = raw.trim()
  if (!cleaned) return ''

  // Substitui padrões como "n° 15", "nº 15", "n.º 15", "nr. 15", "num. 15", "número 15", "numero 15" por ", 15" ou " 15"
  cleaned = cleaned.replace(/\b(?:n[°ºªo\.]*|nr\.?|n[uú]m(?:\.|ero)?)\s*[:=]?\s*(\d+)/gi, ', $1')

  // Remove "n°", "nº", "n.", "nr.", "número", "numero" avulsos ou seguidos de letras
  cleaned = cleaned.replace(/\b(?:n[°ºªo\.]+|nr\.|n[uú]m(?:ero)?)\s*[:=]?\s*/gi, ' ')

  // Substitui "s/n", "s/nº", "sem número", "sem numero" por "" ou espaço limpo
  cleaned = cleaned.replace(/\b(?:s\/n[°ºªo\.]*|sem\s+n[uú]mero)\b/gi, '')

  // Normaliza múltiplos hífens, vírgulas e espaços
  // ATENÇÃO: preservar o hífen do CEP se houver (ex: 03938-050)
  cleaned = cleaned.replace(/(\d{5})\s*-\s*(\d{3})/g, '$1-$2')

  // Normaliza outros hífens para vírgula
  cleaned = cleaned
    .replace(/([^\d\s]|\b\d{1,4})\s+-\s+/g, '$1, ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/,\s*,/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[, -]+|[, -]+$/g, '')
    .trim()

  return cleaned
}

// Coordenadas das referências:
// Cursino: Av. do Cursino, 5797, São Paulo - SP (~ -23.6496, -46.6191)
// Sapopemba: Rua Leandro de Sevilha, São Paulo - SP (~ -23.5971, -46.5085)
export const REFERENCE_LOCATIONS = {
  cursino: {
    key: 'cursino',
    label: 'Próximo à Cursino',
    address: 'Av. do Cursino, 5797, São Paulo, SP, Brasil',
    approxCoords: { lat: -23.649646, lng: -46.619082 },
  },
  sapopemba: {
    key: 'sapopemba',
    label: 'Próxima à Sapopemba',
    address: 'Rua Leandro de Sevilha, São Paulo, SP, Brasil',
    approxCoords: { lat: -23.59712, lng: -46.508518 },
  },
} as const

// Fórmula de Haversine para cálculo de distância em km entre dois pontos geográficos
export function calculateHaversineDistance(coord1: Coordinates, coord2: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const R = 6371 // Raio da Terra em km

  const dLat = toRad(coord2.lat - coord1.lat)
  const dLon = toRad(coord2.lng - coord1.lng)
  const lat1 = toRad(coord1.lat)
  const lat2 = toRad(coord2.lat)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Extrai endereço em formato de string legível e sanitizado
// Detecta se uma string de endereço é truncada ou muito pobre (ex: apenas "Jardim - SP", "São Paulo - SP", "Centro")
export function isTruncatedOrIncompleteAddress(addr: string | null | undefined): boolean {
  if (!addr || typeof addr !== 'string') return true
  const trimmed = addr.trim()
  if (trimmed.length < 5) return true

  // Se tiver CEP brasileiro, NÃO é incompleto
  if (extractCep(trimmed)) return false

  // Se for apenas formato "Bairro - UF" ou "Cidade - UF" sem logradouro/rua nem número nem CEP
  // Ex: "Jardim - SP", "Centro - SP", "Jardim Paraguaçu - SP"
  const isBairroUfOnly = /^([a-zà-ú\s]{2,25})\s*[-,\/]\s*([a-z]{2})$/i.test(trimmed)
  if (isBairroUfOnly) return true

  // Sem número nem indicadores de rua (rua, av, r., travessa, etc.) e muito curto
  const hasStreetIndicator =
    /\b(r\.|rua|av\.|avenida|al\.|alameda|travessa|tv\.|estrada|rodovia|pra[çc]a|pq\.|parque|jd\.|jardim)\b/i.test(
      trimmed,
    )
  const hasNumber = /\b\d{1,5}\b/.test(trimmed)

  if (!hasStreetIndicator && !hasNumber && trimmed.length < 20) {
    return true
  }

  return false
}

// Extrai endereço em formato de string legível e sanitizado
export function formatAddressString(endereco: any, dadosExtraidosOuTexto?: any): string | null {
  if (!endereco && !dadosExtraidosOuTexto) return null

  let directResult: string | null = null

  if (typeof endereco === 'string') {
    const trimmed = endereco.trim()
    if (trimmed && trimmed.toLowerCase() !== 'null' && trimmed.toLowerCase() !== 'undefined') {
      directResult = trimmed
    }
  } else if (typeof endereco === 'object' && endereco !== null) {
    const parts = [
      endereco.logradouro || endereco.rua || endereco.street || endereco.endereco,
      endereco.numero || endereco.number,
      endereco.complemento || endereco.complement,
      endereco.bairro || endereco.neighborhood || endereco.district,
      endereco.cidade || endereco.city,
      endereco.estado || endereco.state || endereco.uf,
      endereco.cep || endereco.zipcode || endereco.postal_code,
    ]
      .filter((p) => p && typeof p === 'string' && p.trim().length > 0)
      .map((p) => String(p).trim())

    if (parts.length > 0) {
      directResult = parts.join(', ')
    }
  }

  // Verificar se há CEP ou campos adicionais em dadosExtraidosOuTexto para enriquecer
  let cepFound: string | null = null
  if (typeof dadosExtraidosOuTexto === 'object' && dadosExtraidosOuTexto !== null) {
    if (dadosExtraidosOuTexto.cep) {
      cepFound = extractCep(String(dadosExtraidosOuTexto.cep))
    }
    if (!cepFound && typeof dadosExtraidosOuTexto.endereco === 'string') {
      cepFound = extractCep(dadosExtraidosOuTexto.endereco)
    }
    if (!cepFound && typeof dadosExtraidosOuTexto.resumo_cv === 'string') {
      cepFound = extractCep(dadosExtraidosOuTexto.resumo_cv)
    }
  } else if (typeof dadosExtraidosOuTexto === 'string') {
    cepFound = extractCep(dadosExtraidosOuTexto)
  }

  if (directResult) {
    if (!extractCep(directResult) && cepFound) {
      directResult = `${directResult}, CEP ${cepFound}`
    }
    const sanitized = sanitizeAddressString(directResult)
    return sanitized || directResult
  }

  // Se directResult ainda não existe mas achamos um CEP:
  if (cepFound) {
    return `CEP ${cepFound}, São Paulo - SP, Brasil`
  }

  return null
}

// Geocodifica um endereço usando a Google Geocoding API com fallback por CEP via ViaCEP
export async function geocodeAddress(
  address: string,
  apiKey: string,
  fallbackRawText?: string | null,
): Promise<Coordinates | null> {
  if (!address && !fallbackRawText) return null

  // 1. Verificar se há CEP no endereço ou no fallbackRawText
  const cep = extractCep(address) || extractCep(fallbackRawText || '')

  // Se o endereço fornecido for truncado/ambíguo (ex: "Jardim - SP") e tivermos CEP ou texto bruto:
  let addressToGeocode = address
  if (isTruncatedOrIncompleteAddress(addressToGeocode)) {
    if (cep) {
      // Usar preferencialmente o CEP quando o endereço textual estiver truncado
      addressToGeocode = `${cep}, Brasil`
    } else if (fallbackRawText && fallbackRawText.length > 10) {
      // Tenta buscar no fallbackRawText algum trecho de endereço mais completo
      const lines = fallbackRawText.split(/\r?\n/)
      for (const line of lines) {
        if (
          /\b(rua|r\.|av\.|avenida|travessa|alameda|estrada|jardim|jd\.|bairro|cep)\b/i.test(
            line,
          ) &&
          line.trim().length > 15
        ) {
          addressToGeocode = line.trim()
          break
        }
      }
    }
  }

  // Sanitiza o endereço antes da geocodificação
  let cleanAddr = sanitizeAddressString(addressToGeocode) || addressToGeocode

  // Qualificação inteligente:
  // Se for endereço de bairro comum (ex: Jardim Paraguaçu, Sapopemba, São Paulo),
  // garantir que "São Paulo, SP" seja qualificado para evitar interpretar como cidade do interior
  if (!/s[aã]o paulo/i.test(cleanAddr) && !/sp\b/i.test(cleanAddr)) {
    cleanAddr = `${cleanAddr}, São Paulo - SP, Brasil`
  } else if (!/brasil/i.test(cleanAddr) && !/brazil/i.test(cleanAddr)) {
    cleanAddr = `${cleanAddr}, Brasil`
  }

  // Tentativa primária no Google Maps Geocoding API
  if (apiKey) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.append('address', cleanAddr)
      url.searchParams.append('key', apiKey)
      url.searchParams.append('language', 'pt-BR')

      const response = await fetch(url.toString())
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const location = data.results[0].geometry.location
          return {
            lat: location.lat,
            lng: location.lng,
          }
        } else {
          console.warn(`[Geocoding] Status ${data.status} para "${cleanAddr}":`, data.error_message)
        }
      } else {
        console.warn(`[Geocoding] HTTP error ${response.status} para "${cleanAddr}"`)
      }
    } catch (error: any) {
      console.error(`[Geocoding] Falha ao geocodificar "${cleanAddr}":`, error?.message)
    }
  }

  // Tentativa secundária: Se temos CEP e a geocodificação direta falhou ou foi imprecisa,
  // consultar ViaCEP para obter logradouro, bairro e cidade exatos, e depois geocodificar esse resultado
  if (cep && apiKey) {
    try {
      const cleanCepNumbers = cep.replace(/\D/g, '')
      const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCepNumbers}/json/`)
      if (viaCepRes.ok) {
        const viaCepData = await viaCepRes.json()
        if (!viaCepData.erro && viaCepData.localidade) {
          const viaCepAddr = [
            viaCepData.logradouro,
            viaCepData.bairro,
            viaCepData.localidade,
            viaCepData.uf,
            'Brasil',
          ]
            .filter(Boolean)
            .join(', ')

          const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
          url.searchParams.append('address', viaCepAddr)
          url.searchParams.append('key', apiKey)
          url.searchParams.append('language', 'pt-BR')

          const response = await fetch(url.toString())
          if (response.ok) {
            const data = await response.json()
            if (data.status === 'OK' && data.results && data.results.length > 0) {
              const location = data.results[0].geometry.location
              return {
                lat: location.lat,
                lng: location.lng,
              }
            }
          }
        }
      }
    } catch (viaCepErr: any) {
      console.warn(`[Geocoding] Falha no fallback ViaCEP para CEP ${cep}:`, viaCepErr?.message)
    }
  }

  return null
}

// Obtém coordenadas de referência para uma dada string de endereço ou texto (ex: título/descrição da vaga, bairro do candidato)
// baseado em palavras-chave ("cursino", "ipiranga", "saúde", "sul" -> Cursino; "santa adélia", "leste", "sapopemba", etc. -> Sapopemba/Leste)
export function getReferenceCoordsForText(text: string): Coordinates | null {
  if (!text) return null
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // Região Sapopemba / Zona Leste
  if (
    norm.includes('santa adelia') ||
    norm.includes('santa adilia') ||
    norm.includes('sapopemba') ||
    norm.includes('zona leste') ||
    norm.includes('zl') ||
    norm.includes('leste') ||
    norm.includes('leandro de sevilha') ||
    norm.includes('pq novo lar') ||
    norm.includes('pq. novo lar') ||
    norm.includes('parque novo lar') ||
    norm.includes('sao mateus') ||
    norm.includes('itaquera') ||
    norm.includes('vila formosa') ||
    norm.includes('vila prudente') ||
    norm.includes('tatuape') ||
    norm.includes('mooca') ||
    norm.includes('arico') ||
    norm.includes('cidade tiradentes') ||
    norm.includes('guaianases') ||
    norm.includes('artur alvim')
  ) {
    return REFERENCE_LOCATIONS.sapopemba.approxCoords
  }

  // Região Cursino / Zona Sul / Ipiranga / Saúde / ABC / Campo Limpo / M'Boi Mirim / Santo Amaro
  if (
    norm.includes('cursino') ||
    norm.includes('ipiranga') ||
    norm.includes('saude') ||
    norm.includes('zona sul') ||
    norm.includes('zs') ||
    norm.includes('sul') ||
    norm.includes('santo andre') ||
    norm.includes('sao bernardo') ||
    norm.includes('diadema') ||
    norm.includes('jabaquara') ||
    norm.includes('sacoma') ||
    norm.includes('vila mariana') ||
    norm.includes('jardim nakamura') ||
    norm.includes('nakamura') ||
    norm.includes('m boi mirim') ||
    norm.includes('mboi mirim') ||
    norm.includes('jardim angela') ||
    norm.includes('jd angela') ||
    norm.includes('jardim sao luis') ||
    norm.includes('capao redondo') ||
    norm.includes('campo limpo') ||
    norm.includes('santo amaro') ||
    norm.includes('socorro') ||
    norm.includes('interlagos') ||
    norm.includes('grajau') ||
    norm.includes('cidade dutra') ||
    norm.includes('pedreira')
  ) {
    return REFERENCE_LOCATIONS.cursino.approxCoords
  }

  return null
}

// Determina qual referência geográfica o endereço está mais próximo (sem raio mínimo)
export async function determineProximity(
  endereco: any,
  apiKey: string,
  refCoords?: {
    cursino?: Coordinates
    sapopemba?: Coordinates
  },
): Promise<'cursino' | 'sapopemba' | null> {
  const addressStr = formatAddressString(endereco)
  if (!addressStr || !apiKey) return null

  const coords = await geocodeAddress(addressStr, apiKey)
  if (!coords) return null

  const cursinoRef = refCoords?.cursino || REFERENCE_LOCATIONS.cursino.approxCoords
  const sapopembaRef = refCoords?.sapopemba || REFERENCE_LOCATIONS.sapopemba.approxCoords

  const distCursino = calculateHaversineDistance(coords, cursinoRef)
  const distSapopemba = calculateHaversineDistance(coords, sapopembaRef)

  console.log(
    `[Proximity] "${addressStr}" -> Cursino: ${distCursino.toFixed(2)}km, Sapopemba: ${distSapopemba.toFixed(2)}km`,
  )

  if (distCursino <= distSapopemba) {
    return 'cursino'
  }

  return 'sapopemba'
}
