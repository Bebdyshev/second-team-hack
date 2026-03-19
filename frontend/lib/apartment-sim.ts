export const FLOORS = 12
export const APARTMENTS_PER_FLOOR = 8
export const HOURS = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`)

export type ApartmentStatus = 'good' | 'watch' | 'alert'

export type ApartmentSimulation = {
  id: string
  floor: number
  unit: number
  number: string
  score: number
  status: ApartmentStatus
  electricityDaily: number[]
  waterDaily: number[]
  electricityMonthly: number[]
  waterMonthly: number[]
  co2Series: number[]
  humiditySeries: number[]
  anomalies: string[]
  recommendations: string[]
  savings: number
  points: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const formatApartmentNumber = (floor: number, unit: number) => `${floor}${String(unit).padStart(2, '0')}`

const getStatusFromScore = (score: number): ApartmentStatus => {
  if (score >= 80) return 'good'
  if (score >= 60) return 'watch'
  return 'alert'
}

const createRandomGenerator = (seed: number) => {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const randomBetween = (nextRandom: () => number, min: number, max: number) => min + nextRandom() * (max - min)

const generateHourlySeries = (
  nextRandom: () => number,
  base: number,
  variability: number,
  morningBoost: number,
  eveningBoost: number,
) =>
  HOURS.map((_, hour) => {
    const morningPeak = Math.exp(-Math.pow(hour - 7.5, 2) / morningBoost)
    const eveningPeak = Math.exp(-Math.pow(hour - 19, 2) / eveningBoost)
    const nightLow = hour >= 0 && hour <= 4 ? 0.68 : 1
    const jitter = randomBetween(nextRandom, -variability, variability)
    return Math.max(0, (base + morningPeak * base * 0.85 + eveningPeak * base * 0.95 + jitter) * nightLow)
  })

export const generateApartmentData = (floor: number, unit: number): ApartmentSimulation => {
  const seed = floor * 1000 + unit * 37
  const nextRandom = createRandomGenerator(seed)
  const number = formatApartmentNumber(floor, unit)
  const basePower = randomBetween(nextRandom, 1.4, 2.8)
  const baseWater = randomBetween(nextRandom, 18, 42)
  const electricityDaily = generateHourlySeries(nextRandom, basePower, 0.35, 4.5, 6.3)
  const waterDaily = generateHourlySeries(nextRandom, baseWater, 6.5, 4.8, 7.8)
  const co2Series = generateHourlySeries(nextRandom, randomBetween(nextRandom, 480, 640), 26, 12, 15).map((value) =>
    Math.round(value),
  )
  const humiditySeries = generateHourlySeries(nextRandom, randomBetween(nextRandom, 38, 52), 4, 18, 10).map((value) =>
    Math.round(value),
  )

  const electricityMonthly = Array.from({ length: 30 }, (_, index) => {
    const weekendBoost = index % 7 === 5 || index % 7 === 6 ? 1.08 : 1
    return Math.round((basePower * 20 + randomBetween(nextRandom, -4, 5)) * weekendBoost)
  })
  const waterMonthly = Array.from({ length: 30 }, (_, index) => {
    const weekendBoost = index % 7 === 5 || index % 7 === 6 ? 1.12 : 1
    return Math.round((baseWater * 3.5 + randomBetween(nextRandom, -8, 9)) * weekendBoost)
  })

  const anomalyRoll = nextRandom()
  const anomalies: string[] = []

  if (anomalyRoll > 0.45) {
    const spikeHour = Math.floor(randomBetween(nextRandom, 2, 22))
    electricityDaily[spikeHour] += randomBetween(nextRandom, 1.4, 3.2)
    anomalies.push(`Unusual electricity spike at ${HOURS[spikeHour].slice(0, 5)}`)
  }
  if (anomalyRoll < 0.55) {
    const leakHour = Math.floor(randomBetween(nextRandom, 0, 23))
    waterDaily[leakHour] += randomBetween(nextRandom, 18, 30)
    anomalies.push(`Possible water leak at ${HOURS[leakHour].slice(0, 5)}`)
  }
  if (anomalyRoll > 0.25 && anomalyRoll < 0.72) {
    const airHour = Math.floor(randomBetween(nextRandom, 10, 22))
    co2Series[airHour] += Math.round(randomBetween(nextRandom, 120, 260))
    anomalies.push(`CO2 comfort drop detected at ${HOURS[airHour].slice(0, 5)}`)
  }

  const ecoScore = clamp(
    Math.round(
      100 -
        electricityDaily.reduce((sum, value) => sum + value, 0) * 0.85 -
        waterDaily.reduce((sum, value) => sum + value, 0) * 0.06 +
        randomBetween(nextRandom, 8, 16),
    ),
    48,
    97,
  )

  return {
    id: `apt-${number}`,
    floor,
    unit,
    number,
    score: ecoScore,
    status: getStatusFromScore(ecoScore),
    electricityDaily,
    waterDaily,
    electricityMonthly,
    waterMonthly,
    co2Series,
    humiditySeries,
    anomalies,
    recommendations: [
      `Shift laundry and dishwasher loads to off-peak hours to save ${Math.round(randomBetween(nextRandom, 12, 22))}%`,
      `Reduce shower time by 2 minutes to save ${Math.round(randomBetween(nextRandom, 18, 30))}L per day`,
      `Open ventilation cycle after 20:00 to lower CO2 by ${Math.round(randomBetween(nextRandom, 8, 16))}%`,
    ],
    savings: Math.round(randomBetween(nextRandom, 9, 24)),
    points: Math.round(ecoScore * 12 + randomBetween(nextRandom, 0, 40)),
  }
}

export const buildDataset = (): ApartmentSimulation[] => {
  const apartments: ApartmentSimulation[] = []
  for (let floor = FLOORS; floor >= 1; floor -= 1) {
    for (let unit = 1; unit <= APARTMENTS_PER_FLOOR; unit += 1) {
      apartments.push(generateApartmentData(floor, unit))
    }
  }
  return apartments
}

export const applyEcoMode = (apartments: ApartmentSimulation[], enable: boolean): ApartmentSimulation[] =>
  apartments.map((apartment) => {
    const powerFactor = enable ? 0.88 : 1 / 0.88
    const waterFactor = enable ? 0.92 : 1 / 0.92
    const score = clamp(apartment.score + (enable ? 6 : -6), 48, 99)
    return {
      ...apartment,
      electricityDaily: apartment.electricityDaily.map((value) => value * powerFactor),
      waterDaily: apartment.waterDaily.map((value) => value * waterFactor),
      score,
      status: getStatusFromScore(score),
      points: apartment.points + (enable ? 36 : -36),
    }
  })

export const tickApartments = (apartments: ApartmentSimulation[], ecoMode: boolean): ApartmentSimulation[] =>
  apartments.map((apartment) => {
    const nextPower = apartment.electricityDaily.map((value, hour) =>
      clamp(value + (Math.random() * 0.19 - 0.08) + (hour === 19 ? 0.08 : 0), 0.4, 7.5),
    )
    const nextWater = apartment.waterDaily.map((value, hour) =>
      clamp(value + (Math.random() * 2.6 - 1.2) + (hour === 7 ? 1 : 0), 5, 80),
    )
    const nextCo2 = apartment.co2Series.map((value) => Math.round(clamp(value + (Math.random() * 18 - 8), 420, 1100)))
    const nextHumidity = apartment.humiditySeries.map((value) => Math.round(clamp(value + (Math.random() * 4 - 2), 30, 68)))
    const score = clamp(apartment.score + Math.round(Math.random() * 2.6 - 1.2) + (ecoMode ? 1 : 0), 48, 99)
    return {
      ...apartment,
      electricityDaily: nextPower,
      waterDaily: nextWater,
      co2Series: nextCo2,
      humiditySeries: nextHumidity,
      score,
      status: getStatusFromScore(score),
    }
  })

export const getApartmentById = (apartmentId: string): ApartmentSimulation | null => {
  const matched = apartmentId.match(/^apt-(\d+)$/)
  if (!matched) return null
  const apartmentCode = Number(matched[1])
  const floor = Math.floor(apartmentCode / 100)
  const unit = apartmentCode % 100
  if (floor < 1 || floor > FLOORS || unit < 1 || unit > APARTMENTS_PER_FLOOR) return null
  return generateApartmentData(floor, unit)
}
