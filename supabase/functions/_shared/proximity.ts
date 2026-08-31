// Helper para cálculo de distância Haversine e geocodificação de proximidade geográfica

export interface Coordinates {
  lat: number
  lng: number
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

export const MAX_DISTANCE_KM = 4.0 // Raio de proximidade em km

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

// Extrai endereço em formato de string legível
export function formatAddressString(endereco: any): string | null {
  if (!endereco) return null
  if (typeof endereco === 'string') {
    const trimmed = endereco.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
      return null
    }
    return trimmed
  }
  if (typeof endereco === 'object') {
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

    if (parts.length === 0) return null
    return parts.join(', ')
  }
  return null
}

// Geocodifica um endereço usando a Google Geocoding API
export async function geocodeAddress(address: string, apiKey: string): Promise<Coordinates | null> {
  if (!address || !apiKey) return null

  // Adiciona contexto de São Paulo/Brasil se não houver
  let queryAddress = address
  if (!/s[aã]o paulo/i.test(queryAddress) && !/sp\b/i.test(queryAddress)) {
    queryAddress = `${queryAddress}, São Paulo - SP, Brasil`
  } else if (!/brasil/i.test(queryAddress) && !/brazil/i.test(queryAddress)) {
    queryAddress = `${queryAddress}, Brasil`
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.append('address', queryAddress)
    url.searchParams.append('key', apiKey)
    url.searchParams.append('language', 'pt-BR')

    const response = await fetch(url.toString())
    if (!response.ok) {
      console.warn(`[Geocoding] HTTP error ${response.status} for address "${address}"`)
      return null
    }

    const data = await response.json()
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location
      return {
        lat: location.lat,
        lng: location.lng,
      }
    } else {
      console.warn(
        `[Geocoding] Status ${data.status} for address "${address}":`,
        data.error_message,
      )
      return null
    }
  } catch (error: any) {
    console.error(`[Geocoding] Falha ao geocodificar "${address}":`, error?.message)
    return null
  }
}

// Determina qual referência geográfica o endereço está mais próximo (< 4km)
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

  if (distCursino <= MAX_DISTANCE_KM && distCursino <= distSapopemba) {
    return 'cursino'
  }
  if (distSapopemba <= MAX_DISTANCE_KM && distSapopemba < distCursino) {
    return 'sapopemba'
  }

  return null
}
