// Helper especializado para geocodificação de endereços apenas com bairro ou incompletos
// Permite que candidatos com endereço apenas de bairro (ex: "Jardim Vila Carrão, São Paulo - SP")
// sejam validados por distância aproximada contra garagens das vagas (Haversine) sem travar em "revisar".

import {
  Coordinates,
  calculateHaversineDistance,
  extractCep,
  getReferenceCoordsForText,
  isTruncatedOrIncompleteAddress,
  sanitizeAddressString,
  REFERENCE_LOCATIONS,
  KNOWN_CEP_COORDS,
} from './proximity.ts'

export interface NeighborhoodGeocodeResult {
  coords: Coordinates | null
  origem:
    | 'cep_conhecido'
    | 'viacep'
    | 'geocoding_bairro'
    | 'referencia_textual'
    | 'geocoding_endereco_completo'
    | null
  bairroConsultado: string | null
  distanciaKm: number | null
  validadoPorBairro: boolean
}

/**
 * Normaliza e enriquece o nome do bairro com contexto da Grande São Paulo / Brasil
 * Ex: "Jardim Vila Carrão" -> "Jardim Vila Carrão, São Paulo - SP, Brasil"
 */
export function buildNeighborhoodQuery(addressOrBairro: string): string {
  const clean = sanitizeAddressString(addressOrBairro) || (addressOrBairro || '').trim()
  if (!clean) return ''

  // Se já possui Brasil e São Paulo
  const hasSp = /s[aã]o paulo/i.test(clean) || /\bsp\b/i.test(clean)
  const hasBrasil = /brasil/i.test(clean) || /brazil/i.test(clean)

  // Outros municípios conhecidos da RMSP (ex: Santo André, Guarulhos, Mauá, etc.)
  const hasCity =
    /\b(santo andr[eé]|s[aã]o bernardo|sbc|s[aã]o caetano|diadema|mau[aá]|guarulhos|osasco|itaquaquecetuba|mogi das cruzes|suzano|po[aá]|ferraz de vasconcelos|barueri|carapicu[ií]ba|tabo[aã]o da serra|embu|cotia|ribeir[aã]o pires|rio grande da serra)\b/i.test(
      clean,
    )

  if (hasBrasil && (hasSp || hasCity)) {
    return clean
  }

  if (hasCity && !hasSp) {
    return `${clean}, SP, Brasil`
  }

  if (!hasSp) {
    return `${clean}, São Paulo - SP, Brasil`
  }

  if (!hasBrasil) {
    return `${clean}, Brasil`
  }

  return clean
}

/**
 * Tenta resolver as coordenadas aproximadas de um endereço baseado em bairro (com ou sem CEP).
 * Ordem de prioridade:
 * 1. CEP no mapa estático (KNOWN_CEP_COORDS)
 * 2. CEP via ViaCEP + Google Geocoding
 * 3. Google Geocoding API com contexto enriquecido do bairro ("bairro, São Paulo - SP, Brasil")
 * 4. Fallback por palavras-chave textuais de referência (getReferenceCoordsForText)
 */
export async function geocodeNeighborhoodOrIncompleteAddress(
  rawAddress: string,
  googleApiKey: string | null | undefined,
  fallbackContextText?: string | null,
): Promise<{
  coords: Coordinates | null
  origem: NeighborhoodGeocodeResult['origem']
  queryUsada: string | null
}> {
  if (!rawAddress && !fallbackContextText) {
    return { coords: null, origem: null, queryUsada: null }
  }

  const baseAddress = (rawAddress || '').trim()
  const cep = extractCep(baseAddress) || extractCep(fallbackContextText || '')

  // 1. CEP em coordenadas conhecidas
  if (cep && KNOWN_CEP_COORDS[cep]) {
    return {
      coords: KNOWN_CEP_COORDS[cep],
      origem: 'cep_conhecido',
      queryUsada: `CEP ${cep}`,
    }
  }

  // 2. Se houver CEP, tentar ViaCEP primeiro para obter o bairro/cidade oficiais
  if (cep && googleApiKey) {
    try {
      const cleanCepNumbers = cep.replace(/\D/g, '')
      const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCepNumbers}/json/`)
      if (viaCepRes.ok) {
        const viaCepData = await viaCepRes.json()
        if (!viaCepData.erro && (viaCepData.bairro || viaCepData.localidade)) {
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
          url.searchParams.append('key', googleApiKey)
          url.searchParams.append('language', 'pt-BR')

          const response = await fetch(url.toString())
          if (response.ok) {
            const data = await response.json()
            if (data.status === 'OK' && data.results && data.results.length > 0) {
              const loc = data.results[0].geometry.location
              return {
                coords: { lat: loc.lat, lng: loc.lng },
                origem: 'viacep',
                queryUsada: viaCepAddr,
              }
            }
          }
        }
      }
    } catch (viaCepErr: any) {
      console.warn(`[geocode-neighborhood] ViaCEP falhou para CEP ${cep}:`, viaCepErr?.message)
    }
  }

  // 3. Geocodificar o bairro com contexto ("bairro, São Paulo - SP, Brasil") via Geocoding API
  const neighborhoodQuery = buildNeighborhoodQuery(baseAddress)
  if (googleApiKey && neighborhoodQuery) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.append('address', neighborhoodQuery)
      url.searchParams.append('key', googleApiKey)
      url.searchParams.append('language', 'pt-BR')

      const response = await fetch(url.toString())
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location
          return {
            coords: { lat: loc.lat, lng: loc.lng },
            origem: 'geocoding_bairro',
            queryUsada: neighborhoodQuery,
          }
        } else {
          console.warn(
            `[geocode-neighborhood] Google Geocoding status ${data.status} para "${neighborhoodQuery}":`,
            data.error_message,
          )
        }
      }
    } catch (gErr: any) {
      console.error(
        `[geocode-neighborhood] Erro na Geocoding API para "${neighborhoodQuery}":`,
        gErr?.message,
      )
    }
  }

  // 4. Fallback de referência textual
  const refCoords =
    getReferenceCoordsForText(baseAddress) ||
    (fallbackContextText ? getReferenceCoordsForText(fallbackContextText) : null)

  if (refCoords) {
    return {
      coords: refCoords,
      origem: 'referencia_textual',
      queryUsada: baseAddress,
    }
  }

  return { coords: null, origem: null, queryUsada: null }
}

/**
 * Resolve as coordenadas de uma garagem/localização da vaga
 */
export async function resolveGarageCoordinates(
  locVagaStr: string,
  vagaTitulo: string,
  googleApiKey: string | null | undefined,
): Promise<Coordinates | null> {
  const lowerTitulo = (vagaTitulo || '').toLowerCase()
  if (lowerTitulo.includes('cursino')) {
    return REFERENCE_LOCATIONS.cursino.approxCoords
  }
  if (lowerTitulo.includes('leste') || lowerTitulo.includes('sapopemba')) {
    return REFERENCE_LOCATIONS.sapopemba.approxCoords
  }

  // Fallback de texto na localização
  const fromText = getReferenceCoordsForText(locVagaStr)
  if (fromText) return fromText

  if (googleApiKey && locVagaStr) {
    try {
      const cleanLoc = sanitizeAddressString(locVagaStr) || locVagaStr
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.append('address', cleanLoc)
      url.searchParams.append('key', googleApiKey)
      url.searchParams.append('language', 'pt-BR')
      const resp = await fetch(url.toString())
      if (resp.ok) {
        const data = await resp.json()
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location
          return { lat: loc.lat, lng: loc.lng }
        }
      }
    } catch (e: any) {
      console.warn(
        `[geocode-neighborhood] Falha ao geocodificar garagem "${locVagaStr}":`,
        e?.message,
      )
    }
  }

  return null
}

/**
 * Calcula a menor distância aproximada (Haversine) entre um endereço só de bairro e as garagens da vaga.
 * Retorna se foi validado por bairro e a menor distância calculada.
 */
export async function calculateNeighborhoodProximity(
  candidateAddress: string,
  localizacoesVaga: string[],
  vagaTitulo: string,
  googleApiKey: string | null | undefined,
  fallbackContextText?: string | null,
): Promise<{
  menorDistanciaKm: number | null
  validadoPorBairro: boolean
  origem: NeighborhoodGeocodeResult['origem']
  candidateCoords: Coordinates | null
  queryUsada: string | null
}> {
  const geo = await geocodeNeighborhoodOrIncompleteAddress(
    candidateAddress,
    googleApiKey,
    fallbackContextText,
  )

  if (!geo.coords) {
    return {
      menorDistanciaKm: null,
      validadoPorBairro: false,
      origem: null,
      candidateCoords: null,
      queryUsada: null,
    }
  }

  let menorDist: number | null = null

  // Se não houver localizações explícitas de garagem, usa o título da vaga como referência
  const locs = localizacoesVaga.length > 0 ? localizacoesVaga : [vagaTitulo]

  for (const locStr of locs) {
    const garageCoords = await resolveGarageCoordinates(locStr, vagaTitulo, googleApiKey)
    if (garageCoords) {
      const dist = calculateHaversineDistance(geo.coords, garageCoords)
      if (menorDist === null || dist < menorDist) {
        menorDist = dist
      }
    }
  }

  return {
    menorDistanciaKm: menorDist !== null ? Number(menorDist.toFixed(2)) : null,
    validadoPorBairro: menorDist !== null,
    origem: geo.origem,
    candidateCoords: geo.coords,
    queryUsada: geo.queryUsada,
  }
}

/**
 * Sanidade de geocodificação e distância:
 * Se a distância calculada ultrapassar um limiar plausível (ex. 15 km)
 * ou se houver indício de geocodificação imprecisa (ex. CEP mal geocodificado para o centro da cidade),
 * re-checa a geocodificação cruzando:
 * 1. Endereço completo + número + bairro
 * 2. ViaCEP (obtendo logradouro oficial, bairro oficial e cidade)
 * 3. Bairro / Distrito geocodificado diretamente
 * 4. Fallback textual de região conhecida
 * Retorna as coordenadas mais precisas, a nova distância recalculada e o método utilizado.
 */
export async function sanitizeAndRecheckCoordinates(
  candidateAddressStr: string,
  garageCoords: Coordinates,
  currentCalculatedDistanceKm: number | null,
  googleApiKey: string | null | undefined,
  fallbackText?: string | null,
): Promise<{
  coords: Coordinates | null
  distanciaKm: number | null
  metodoGeolocalizacao: string
  divergenciaDetectada: boolean
}> {
  const cep = extractCep(candidateAddressStr) || extractCep(fallbackText || '')
  let metodo = 'distance_matrix_direto'
  let bestCoords: Coordinates | null = null
  let bestDist = currentCalculatedDistanceKm
  let divergencia = false

  // Se distância calculada é plausível e menor que 15 km e não há divergência óbvia
  const needsRecheck = currentCalculatedDistanceKm === null || currentCalculatedDistanceKm > 15

  if (!needsRecheck && currentCalculatedDistanceKm !== null) {
    return {
      coords: null,
      distanciaKm: currentCalculatedDistanceKm,
      metodoGeolocalizacao: 'distance_matrix_direto',
      divergenciaDetectada: false,
    }
  }

  console.log(
    `[sanitizeAndRecheckCoordinates] Acionando sanidade de distância para "${candidateAddressStr}" (distância atual: ${currentCalculatedDistanceKm?.toFixed(1) || 'null'} km > 15 km ou nula)...`,
  )

  // 1. Tentar mapa de CEPs conhecidos
  if (cep && KNOWN_CEP_COORDS[cep]) {
    bestCoords = KNOWN_CEP_COORDS[cep]
    metodo = 'cep_conhecido_validado'
    bestDist = calculateHaversineDistance(bestCoords, garageCoords)
    divergencia =
      currentCalculatedDistanceKm !== null && Math.abs(bestDist - currentCalculatedDistanceKm) > 2
    console.log(
      `[sanitizeAndRecheckCoordinates] CEP conhecido encontrado (${cep}): recalculado de ${currentCalculatedDistanceKm?.toFixed(1)} km para ${bestDist.toFixed(1)} km (divergência=${divergencia})`,
    )
    return {
      coords: bestCoords,
      distanciaKm: Number(bestDist.toFixed(2)),
      metodoGeolocalizacao: metodo,
      divergenciaDetectada: divergencia,
    }
  }

  // 2. ViaCEP + Google Geocoding com endereço enriquecido (logradouro + bairro + cidade)
  if (cep && googleApiKey) {
    try {
      const cleanCepNumbers = cep.replace(/\D/g, '')
      const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCepNumbers}/json/`)
      if (viaCepRes.ok) {
        const viaCepData = await viaCepRes.json()
        if (!viaCepData.erro && viaCepData.localidade) {
          // Extrair número do endereço original se houver
          const numMatch = candidateAddressStr.match(
            /\b(?:n[°ºªo\.]*|nr\.?|n[uú]m(?:\.|ero)?|\b)\s*[:=]?\s*(\d{1,5})\b/i,
          )
          const numeroEncontrado = numMatch ? numMatch[1] : ''

          const viaCepFullAddr = [
            viaCepData.logradouro
              ? `${viaCepData.logradouro}${numeroEncontrado ? `, ${numeroEncontrado}` : ''}`
              : null,
            viaCepData.bairro,
            viaCepData.localidade,
            viaCepData.uf,
            'Brasil',
          ]
            .filter(Boolean)
            .join(', ')

          const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
          url.searchParams.append('address', viaCepFullAddr)
          url.searchParams.append('key', googleApiKey)
          url.searchParams.append('language', 'pt-BR')

          const resp = await fetch(url.toString())
          if (resp.ok) {
            const data = await resp.json()
            if (data.status === 'OK' && data.results && data.results.length > 0) {
              const loc = data.results[0].geometry.location
              bestCoords = { lat: loc.lat, lng: loc.lng }
              bestDist = calculateHaversineDistance(bestCoords, garageCoords)
              metodo = 'viacep_mais_geocoding_completo'
              divergencia =
                currentCalculatedDistanceKm !== null &&
                Math.abs(bestDist - currentCalculatedDistanceKm) > 2
              console.log(
                `[sanitizeAndRecheckCoordinates] ViaCEP + Geocoding ("${viaCepFullAddr}"): recalculado de ${currentCalculatedDistanceKm?.toFixed(1)} km para ${bestDist.toFixed(1)} km (divergência=${divergencia})`,
              )
              return {
                coords: bestCoords,
                distanciaKm: Number(bestDist.toFixed(2)),
                metodoGeolocalizacao: metodo,
                divergenciaDetectada: divergencia,
              }
            }
          }
        }
      }
    } catch (viaErr: any) {
      console.warn(`[sanitizeAndRecheckCoordinates] Falha no ViaCEP:`, viaErr?.message)
    }
  }

  // 3. Geocodificação focada no Bairro / Distrito
  // Se o endereço contiver bairro (ex: "Parque Bristol", "Vila Moraes", "Sapopemba")
  if (googleApiKey) {
    const neighborhoodQuery = buildNeighborhoodQuery(candidateAddressStr)
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.append('address', neighborhoodQuery)
      url.searchParams.append('key', googleApiKey)
      url.searchParams.append('language', 'pt-BR')

      const resp = await fetch(url.toString())
      if (resp.ok) {
        const data = await resp.json()
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location
          const bCoords = { lat: loc.lat, lng: loc.lng }
          const bDist = calculateHaversineDistance(bCoords, garageCoords)

          // Se a distância pelo bairro for significativamente menor do que a distância inflada (> 3km menor)
          if (currentCalculatedDistanceKm === null || bDist < currentCalculatedDistanceKm) {
            bestCoords = bCoords
            bestDist = bDist
            metodo = 'geocoding_bairro_sanidade'
            divergencia =
              currentCalculatedDistanceKm !== null && currentCalculatedDistanceKm - bDist > 3
            return {
              coords: bestCoords,
              distanciaKm: Number(bestDist.toFixed(2)),
              metodoGeolocalizacao: metodo,
              divergenciaDetectada: divergencia,
            }
          }
        }
      }
    } catch (bErr: any) {
      console.warn(`[sanitizeAndRecheckCoordinates] Falha no geocoding do bairro:`, bErr?.message)
    }
  }

  // 4. Fallback de referência textual
  const ref =
    getReferenceCoordsForText(candidateAddressStr) ||
    (fallbackText ? getReferenceCoordsForText(fallbackText) : null)
  if (ref) {
    const refDist = calculateHaversineDistance(ref, garageCoords)
    if (currentCalculatedDistanceKm === null || refDist < currentCalculatedDistanceKm) {
      bestCoords = ref
      bestDist = refDist
      metodo = 'referencia_textual_bairro'
      divergencia =
        currentCalculatedDistanceKm !== null && currentCalculatedDistanceKm - refDist > 3
      return {
        coords: bestCoords,
        distanciaKm: Number(bestDist.toFixed(2)),
        metodoGeolocalizacao: metodo,
        divergenciaDetectada: divergencia,
      }
    }
  }

  return {
    coords: bestCoords,
    distanciaKm: bestDist !== null ? Number(bestDist.toFixed(2)) : null,
    metodoGeolocalizacao: metodo,
    divergenciaDetectada: false,
  }
}
