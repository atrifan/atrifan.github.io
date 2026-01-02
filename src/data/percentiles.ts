/**
 * Percentile Data for Height and Weight by Age and Gender
 * 
 * Data Source: CDC Growth Charts and WHO Global Health Observatory (2025)
 * Reference: https://www.cdc.gov/growthcharts/ and https://www.who.int/data/gho
 * 
 * DISCLAIMER: This data is for informational purposes only and based on 2025 
 * population statistics. Individual health assessments should be done by 
 * healthcare professionals.
 */

export interface PercentileData {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface AgeGenderData {
  height: PercentileData; // in cm
  weight: PercentileData; // in kg
}

// Height percentiles by age and gender (in cm)
// Weight percentiles by age and gender (in kg)
// Data represents US/Global averages from CDC/WHO 2025 data

export const PERCENTILE_DATA: Record<string, Record<number, AgeGenderData>> = {
  male: {
    // Children and teens
    2: { height: { p5: 82.5, p10: 84.0, p25: 86.5, p50: 89.0, p75: 91.5, p90: 94.0, p95: 95.5 }, weight: { p5: 10.5, p10: 11.0, p25: 12.0, p50: 13.0, p75: 14.2, p90: 15.5, p95: 16.5 } },
    3: { height: { p5: 89.0, p10: 91.0, p25: 94.0, p50: 97.0, p75: 100.0, p90: 103.0, p95: 105.0 }, weight: { p5: 12.0, p10: 12.8, p25: 14.0, p50: 15.5, p75: 17.0, p90: 18.5, p95: 19.5 } },
    4: { height: { p5: 95.5, p10: 97.5, p25: 101.0, p50: 104.5, p75: 108.0, p90: 111.0, p95: 113.0 }, weight: { p5: 13.5, p10: 14.5, p25: 16.0, p50: 17.5, p75: 19.5, p90: 21.5, p95: 23.0 } },
    5: { height: { p5: 101.5, p10: 104.0, p25: 107.5, p50: 111.5, p75: 115.5, p90: 119.0, p95: 121.0 }, weight: { p5: 15.0, p10: 16.0, p25: 18.0, p50: 20.0, p75: 22.5, p90: 25.0, p95: 27.0 } },
    6: { height: { p5: 107.0, p10: 109.5, p25: 113.5, p50: 118.0, p75: 122.5, p90: 126.5, p95: 129.0 }, weight: { p5: 16.5, p10: 18.0, p25: 20.0, p50: 22.5, p75: 25.5, p90: 29.0, p95: 32.0 } },
    7: { height: { p5: 112.0, p10: 115.0, p25: 119.5, p50: 124.0, p75: 129.0, p90: 133.5, p95: 136.0 }, weight: { p5: 18.5, p10: 20.0, p25: 22.5, p50: 25.5, p75: 29.5, p90: 34.0, p95: 38.0 } },
    8: { height: { p5: 117.0, p10: 120.0, p25: 125.0, p50: 130.0, p75: 135.0, p90: 140.0, p95: 143.0 }, weight: { p5: 20.5, p10: 22.5, p25: 25.5, p50: 29.0, p75: 34.0, p90: 40.0, p95: 45.0 } },
    9: { height: { p5: 121.5, p10: 125.0, p25: 130.0, p50: 135.5, p75: 141.0, p90: 146.0, p95: 149.0 }, weight: { p5: 22.5, p10: 25.0, p25: 28.5, p50: 33.0, p75: 39.0, p90: 46.0, p95: 52.0 } },
    10: { height: { p5: 126.0, p10: 129.5, p25: 135.0, p50: 141.0, p75: 147.0, p90: 152.5, p95: 156.0 }, weight: { p5: 25.0, p10: 28.0, p25: 32.0, p50: 37.5, p75: 44.5, p90: 53.0, p95: 60.0 } },
    11: { height: { p5: 130.5, p10: 134.5, p25: 140.5, p50: 147.0, p75: 153.5, p90: 159.5, p95: 163.0 }, weight: { p5: 28.0, p10: 31.5, p25: 36.5, p50: 43.0, p75: 51.5, p90: 61.0, p95: 69.0 } },
    12: { height: { p5: 135.5, p10: 140.0, p25: 146.5, p50: 153.5, p75: 160.5, p90: 167.0, p95: 171.0 }, weight: { p5: 31.5, p10: 35.5, p25: 41.5, p50: 49.0, p75: 58.5, p90: 69.5, p95: 78.0 } },
    13: { height: { p5: 142.0, p10: 147.0, p25: 154.0, p50: 161.5, p75: 169.0, p90: 175.5, p95: 179.0 }, weight: { p5: 36.0, p10: 40.5, p25: 47.5, p50: 56.0, p75: 66.5, p90: 78.0, p95: 87.0 } },
    14: { height: { p5: 149.0, p10: 154.5, p25: 161.5, p50: 169.0, p75: 176.0, p90: 182.0, p95: 185.5 }, weight: { p5: 41.0, p10: 46.0, p25: 54.0, p50: 63.5, p75: 74.5, p90: 86.5, p95: 95.5 } },
    15: { height: { p5: 155.0, p10: 160.0, p25: 167.0, p50: 174.0, p75: 180.5, p90: 186.0, p95: 189.0 }, weight: { p5: 46.0, p10: 51.5, p25: 59.5, p50: 69.5, p75: 80.5, p90: 92.5, p95: 101.5 } },
    16: { height: { p5: 159.0, p10: 163.5, p25: 170.0, p50: 176.5, p75: 183.0, p90: 188.0, p95: 191.0 }, weight: { p5: 50.5, p10: 56.0, p25: 64.0, p50: 74.0, p75: 85.0, p90: 97.0, p95: 106.0 } },
    17: { height: { p5: 161.0, p10: 165.5, p25: 171.5, p50: 178.0, p75: 184.0, p90: 189.0, p95: 192.0 }, weight: { p5: 53.5, p10: 59.0, p25: 67.0, p50: 77.0, p75: 88.0, p90: 100.0, p95: 109.0 } },
    18: { height: { p5: 162.5, p10: 166.5, p25: 172.5, p50: 178.5, p75: 184.5, p90: 189.5, p95: 192.5 }, weight: { p5: 55.5, p10: 61.0, p25: 69.0, p50: 79.0, p75: 90.0, p90: 102.0, p95: 111.0 } },
    // Adults (18-80)
    20: { height: { p5: 163.0, p10: 167.0, p25: 173.0, p50: 179.0, p75: 185.0, p90: 190.0, p95: 193.0 }, weight: { p5: 58.0, p10: 64.0, p25: 72.0, p50: 82.0, p75: 94.0, p90: 107.0, p95: 117.0 } },
    25: { height: { p5: 163.0, p10: 167.0, p25: 173.0, p50: 179.0, p75: 185.0, p90: 190.0, p95: 193.0 }, weight: { p5: 60.0, p10: 66.0, p25: 75.0, p50: 86.0, p75: 99.0, p90: 113.0, p95: 123.0 } },
    30: { height: { p5: 163.0, p10: 167.0, p25: 173.0, p50: 179.0, p75: 185.0, p90: 190.0, p95: 193.0 }, weight: { p5: 62.0, p10: 68.0, p25: 77.0, p50: 88.0, p75: 102.0, p90: 117.0, p95: 128.0 } },
    35: { height: { p5: 163.0, p10: 167.0, p25: 173.0, p50: 179.0, p75: 185.0, p90: 190.0, p95: 193.0 }, weight: { p5: 63.0, p10: 69.5, p25: 79.0, p50: 90.0, p75: 104.0, p90: 119.0, p95: 130.0 } },
    40: { height: { p5: 162.5, p10: 166.5, p25: 172.5, p50: 178.5, p75: 184.5, p90: 189.5, p95: 192.5 }, weight: { p5: 64.0, p10: 70.5, p25: 80.0, p50: 91.5, p75: 105.5, p90: 121.0, p95: 132.0 } },
    45: { height: { p5: 162.0, p10: 166.0, p25: 172.0, p50: 178.0, p75: 184.0, p90: 189.0, p95: 192.0 }, weight: { p5: 64.5, p10: 71.0, p25: 80.5, p50: 92.0, p75: 106.0, p90: 122.0, p95: 133.0 } },
    50: { height: { p5: 161.5, p10: 165.5, p25: 171.5, p50: 177.5, p75: 183.5, p90: 188.5, p95: 191.5 }, weight: { p5: 64.5, p10: 71.0, p25: 80.5, p50: 92.0, p75: 106.0, p90: 121.5, p95: 132.5 } },
    55: { height: { p5: 161.0, p10: 165.0, p25: 171.0, p50: 177.0, p75: 183.0, p90: 188.0, p95: 191.0 }, weight: { p5: 64.0, p10: 70.5, p25: 80.0, p50: 91.5, p75: 105.5, p90: 120.5, p95: 131.5 } },
    60: { height: { p5: 160.0, p10: 164.0, p25: 170.0, p50: 176.0, p75: 182.0, p90: 187.0, p95: 190.0 }, weight: { p5: 63.0, p10: 69.5, p25: 79.0, p50: 90.0, p75: 104.0, p90: 119.0, p95: 130.0 } },
    65: { height: { p5: 159.0, p10: 163.0, p25: 169.0, p50: 175.0, p75: 181.0, p90: 186.0, p95: 189.0 }, weight: { p5: 62.0, p10: 68.0, p25: 77.5, p50: 88.5, p75: 102.0, p90: 117.0, p95: 127.5 } },
    70: { height: { p5: 158.0, p10: 162.0, p25: 168.0, p50: 174.0, p75: 180.0, p90: 185.0, p95: 188.0 }, weight: { p5: 60.0, p10: 66.0, p25: 75.5, p50: 86.5, p75: 99.5, p90: 114.0, p95: 124.5 } },
    75: { height: { p5: 157.0, p10: 161.0, p25: 167.0, p50: 173.0, p75: 179.0, p90: 184.0, p95: 187.0 }, weight: { p5: 58.0, p10: 64.0, p25: 73.0, p50: 84.0, p75: 97.0, p90: 111.0, p95: 121.0 } },
    80: { height: { p5: 156.0, p10: 160.0, p25: 166.0, p50: 172.0, p75: 178.0, p90: 183.0, p95: 186.0 }, weight: { p5: 56.0, p10: 62.0, p25: 71.0, p50: 81.5, p75: 94.0, p90: 108.0, p95: 118.0 } },
  },
  female: {
    // Children and teens
    2: { height: { p5: 81.0, p10: 82.5, p25: 85.0, p50: 87.5, p75: 90.0, p90: 92.5, p95: 94.0 }, weight: { p5: 10.0, p10: 10.5, p25: 11.5, p50: 12.5, p75: 13.5, p90: 14.8, p95: 15.8 } },
    3: { height: { p5: 87.5, p10: 89.5, p25: 92.5, p50: 95.5, p75: 98.5, p90: 101.5, p95: 103.5 }, weight: { p5: 11.5, p10: 12.2, p25: 13.5, p50: 15.0, p75: 16.5, p90: 18.0, p95: 19.0 } },
    4: { height: { p5: 94.0, p10: 96.0, p25: 99.5, p50: 103.0, p75: 106.5, p90: 110.0, p95: 112.0 }, weight: { p5: 13.0, p10: 14.0, p25: 15.5, p50: 17.0, p75: 19.0, p90: 21.0, p95: 22.5 } },
    5: { height: { p5: 100.0, p10: 102.5, p25: 106.0, p50: 110.0, p75: 114.0, p90: 117.5, p95: 120.0 }, weight: { p5: 14.5, p10: 15.5, p25: 17.5, p50: 19.5, p75: 22.0, p90: 24.5, p95: 26.5 } },
    6: { height: { p5: 105.5, p10: 108.0, p25: 112.0, p50: 116.5, p75: 121.0, p90: 125.0, p95: 127.5 }, weight: { p5: 16.0, p10: 17.5, p25: 19.5, p50: 22.0, p75: 25.0, p90: 28.5, p95: 31.0 } },
    7: { height: { p5: 110.5, p10: 113.5, p25: 118.0, p50: 123.0, p75: 128.0, p90: 132.5, p95: 135.0 }, weight: { p5: 18.0, p10: 19.5, p25: 22.0, p50: 25.0, p75: 29.0, p90: 33.5, p95: 37.0 } },
    8: { height: { p5: 115.5, p10: 119.0, p25: 124.0, p50: 129.5, p75: 135.0, p90: 140.0, p95: 143.0 }, weight: { p5: 20.0, p10: 22.0, p25: 25.0, p50: 28.5, p75: 33.5, p90: 39.5, p95: 44.0 } },
    9: { height: { p5: 120.5, p10: 124.0, p25: 129.5, p50: 135.5, p75: 141.5, p90: 147.0, p95: 150.0 }, weight: { p5: 22.5, p10: 25.0, p25: 28.5, p50: 33.0, p75: 39.0, p90: 46.0, p95: 52.0 } },
    10: { height: { p5: 125.5, p10: 129.5, p25: 135.5, p50: 142.0, p75: 148.5, p90: 154.5, p95: 158.0 }, weight: { p5: 25.5, p10: 28.5, p25: 33.0, p50: 38.5, p75: 46.0, p90: 54.5, p95: 61.5 } },
    11: { height: { p5: 131.0, p10: 135.5, p25: 142.0, p50: 149.0, p75: 156.0, p90: 162.0, p95: 165.5 }, weight: { p5: 29.5, p10: 33.0, p25: 38.5, p50: 45.5, p75: 54.5, p90: 64.5, p95: 72.5 } },
    12: { height: { p5: 137.0, p10: 141.5, p25: 148.0, p50: 155.0, p75: 161.5, p90: 167.0, p95: 170.0 }, weight: { p5: 34.0, p10: 38.0, p25: 44.5, p50: 52.5, p75: 62.5, p90: 73.5, p95: 82.0 } },
    13: { height: { p5: 142.0, p10: 146.5, p25: 152.5, p50: 159.0, p75: 165.0, p90: 170.0, p95: 173.0 }, weight: { p5: 38.5, p10: 43.0, p25: 50.0, p50: 58.5, p75: 69.0, p90: 80.5, p95: 89.0 } },
    14: { height: { p5: 145.5, p10: 149.5, p25: 155.5, p50: 161.5, p75: 167.0, p90: 172.0, p95: 174.5 }, weight: { p5: 42.5, p10: 47.0, p25: 54.5, p50: 63.0, p75: 73.5, p90: 85.0, p95: 93.5 } },
    15: { height: { p5: 147.5, p10: 151.5, p25: 157.0, p50: 163.0, p75: 168.5, p90: 173.0, p95: 175.5 }, weight: { p5: 45.0, p10: 49.5, p25: 57.0, p50: 66.0, p75: 76.5, p90: 88.0, p95: 96.5 } },
    16: { height: { p5: 148.5, p10: 152.5, p25: 158.0, p50: 163.5, p75: 169.0, p90: 173.5, p95: 176.0 }, weight: { p5: 46.5, p10: 51.0, p25: 58.5, p50: 67.5, p75: 78.0, p90: 89.5, p95: 98.0 } },
    17: { height: { p5: 149.0, p10: 153.0, p25: 158.5, p50: 164.0, p75: 169.5, p90: 174.0, p95: 176.5 }, weight: { p5: 47.5, p10: 52.0, p25: 59.5, p50: 68.5, p75: 79.0, p90: 90.5, p95: 99.0 } },
    18: { height: { p5: 149.5, p10: 153.5, p25: 159.0, p50: 164.5, p75: 170.0, p90: 174.5, p95: 177.0 }, weight: { p5: 48.0, p10: 52.5, p25: 60.0, p50: 69.0, p75: 79.5, p90: 91.0, p95: 99.5 } },
    // Adults (18-80)
    20: { height: { p5: 150.0, p10: 154.0, p25: 159.5, p50: 165.0, p75: 170.5, p90: 175.0, p95: 177.5 }, weight: { p5: 49.0, p10: 54.0, p25: 62.0, p50: 71.5, p75: 83.0, p90: 96.0, p95: 106.0 } },
    25: { height: { p5: 150.0, p10: 154.0, p25: 159.5, p50: 165.0, p75: 170.5, p90: 175.0, p95: 177.5 }, weight: { p5: 50.0, p10: 55.5, p25: 64.0, p50: 74.0, p75: 86.5, p90: 100.5, p95: 111.0 } },
    30: { height: { p5: 150.0, p10: 154.0, p25: 159.5, p50: 165.0, p75: 170.5, p90: 175.0, p95: 177.5 }, weight: { p5: 51.0, p10: 57.0, p25: 66.0, p50: 76.5, p75: 89.5, p90: 104.0, p95: 115.0 } },
    35: { height: { p5: 150.0, p10: 154.0, p25: 159.5, p50: 165.0, p75: 170.5, p90: 175.0, p95: 177.5 }, weight: { p5: 52.0, p10: 58.0, p25: 67.5, p50: 78.5, p75: 92.0, p90: 107.0, p95: 118.0 } },
    40: { height: { p5: 149.5, p10: 153.5, p25: 159.0, p50: 164.5, p75: 170.0, p90: 174.5, p95: 177.0 }, weight: { p5: 53.0, p10: 59.0, p25: 68.5, p50: 80.0, p75: 94.0, p90: 109.5, p95: 121.0 } },
    45: { height: { p5: 149.0, p10: 153.0, p25: 158.5, p50: 164.0, p75: 169.5, p90: 174.0, p95: 176.5 }, weight: { p5: 53.5, p10: 59.5, p25: 69.5, p50: 81.0, p75: 95.5, p90: 111.0, p95: 122.5 } },
    50: { height: { p5: 148.5, p10: 152.5, p25: 158.0, p50: 163.5, p75: 169.0, p90: 173.5, p95: 176.0 }, weight: { p5: 54.0, p10: 60.0, p25: 70.0, p50: 81.5, p75: 96.0, p90: 111.5, p95: 123.0 } },
    55: { height: { p5: 148.0, p10: 152.0, p25: 157.5, p50: 163.0, p75: 168.5, p90: 173.0, p95: 175.5 }, weight: { p5: 54.0, p10: 60.0, p25: 70.0, p50: 81.5, p75: 96.0, p90: 111.5, p95: 123.0 } },
    60: { height: { p5: 147.0, p10: 151.0, p25: 156.5, p50: 162.0, p75: 167.5, p90: 172.0, p95: 174.5 }, weight: { p5: 53.5, p10: 59.5, p25: 69.0, p50: 80.5, p75: 94.5, p90: 110.0, p95: 121.0 } },
    65: { height: { p5: 146.0, p10: 150.0, p25: 155.5, p50: 161.0, p75: 166.5, p90: 171.0, p95: 173.5 }, weight: { p5: 52.5, p10: 58.5, p25: 68.0, p50: 79.0, p75: 93.0, p90: 108.0, p95: 119.0 } },
    70: { height: { p5: 145.0, p10: 149.0, p25: 154.5, p50: 160.0, p75: 165.5, p90: 170.0, p95: 172.5 }, weight: { p5: 51.0, p10: 57.0, p25: 66.5, p50: 77.5, p75: 91.0, p90: 105.5, p95: 116.0 } },
    75: { height: { p5: 144.0, p10: 148.0, p25: 153.5, p50: 159.0, p75: 164.5, p90: 169.0, p95: 171.5 }, weight: { p5: 49.5, p10: 55.5, p25: 64.5, p50: 75.5, p75: 88.5, p90: 103.0, p95: 113.0 } },
    80: { height: { p5: 143.0, p10: 147.0, p25: 152.5, p50: 158.0, p75: 163.5, p90: 168.0, p95: 170.5 }, weight: { p5: 48.0, p10: 54.0, p25: 63.0, p50: 73.5, p75: 86.0, p90: 100.0, p95: 110.0 } },
  },
};

/**
 * Get the closest age bracket for percentile lookup
 */
export const getClosestAge = (age: number): number => {
  const ages = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  if (age < 2) return 2;
  if (age > 80) return 80;
  return ages.reduce((prev, curr) => Math.abs(curr - age) < Math.abs(prev - age) ? curr : prev);
};

/**
 * Calculate percentile for a given value within a percentile distribution
 */
export const calculatePercentile = (value: number, data: PercentileData): number => {
  const points = [
    { p: 5, v: data.p5 },
    { p: 10, v: data.p10 },
    { p: 25, v: data.p25 },
    { p: 50, v: data.p50 },
    { p: 75, v: data.p75 },
    { p: 90, v: data.p90 },
    { p: 95, v: data.p95 },
  ];

  // Below minimum
  if (value <= data.p5) {
    const ratio = value / data.p5;
    return Math.max(1, Math.round(5 * ratio));
  }

  // Above maximum
  if (value >= data.p95) {
    const excess = (value - data.p95) / (data.p95 - data.p50);
    return Math.min(99, Math.round(95 + 4 * (1 - Math.exp(-excess))));
  }

  // Interpolate between known points
  for (let i = 0; i < points.length - 1; i++) {
    if (value >= points[i].v && value <= points[i + 1].v) {
      const range = points[i + 1].v - points[i].v;
      const position = (value - points[i].v) / range;
      const percentileRange = points[i + 1].p - points[i].p;
      return Math.round(points[i].p + position * percentileRange);
    }
  }

  return 50; // Default fallback
};

export interface PercentileResult {
  dimension: 'height' | 'weight' | 'age' | 'gender';
  value: number | string;
  percentile: number;
  label: string;
}

/**
 * World Population Age Distribution (2025)
 * Source: UN World Population Prospects 2024 via StatisticsTimes.com
 *
 * Cumulative percentage of world population younger than each age group
 * Total world population: 8,231,613,070
 */
const AGE_CUMULATIVE_PERCENTAGES: { maxAge: number; cumulativePercent: number }[] = [
  { maxAge: 4, cumulativePercent: 7.8 },
  { maxAge: 9, cumulativePercent: 16.0 },
  { maxAge: 14, cumulativePercent: 24.4 },
  { maxAge: 19, cumulativePercent: 32.4 },
  { maxAge: 24, cumulativePercent: 40.0 },
  { maxAge: 29, cumulativePercent: 47.3 },
  { maxAge: 34, cumulativePercent: 54.6 },
  { maxAge: 39, cumulativePercent: 61.9 },
  { maxAge: 44, cumulativePercent: 68.5 },
  { maxAge: 49, cumulativePercent: 74.4 },
  { maxAge: 54, cumulativePercent: 80.0 },
  { maxAge: 59, cumulativePercent: 85.2 },
  { maxAge: 64, cumulativePercent: 89.6 },
  { maxAge: 69, cumulativePercent: 93.2 },
  { maxAge: 74, cumulativePercent: 96.1 },
  { maxAge: 79, cumulativePercent: 98.0 },
  { maxAge: 84, cumulativePercent: 99.1 },
  { maxAge: 89, cumulativePercent: 99.7 },
  { maxAge: 94, cumulativePercent: 99.95 },
  { maxAge: 99, cumulativePercent: 99.99 },
  { maxAge: 120, cumulativePercent: 100 },
];

/**
 * Calculate age percentile - what % of world population is younger than you
 */
export const calculateAgePercentile = (age: number): number => {
  if (age <= 0) return 1;
  if (age >= 100) return 99;

  // Find the bracket
  for (let i = 0; i < AGE_CUMULATIVE_PERCENTAGES.length; i++) {
    const bracket = AGE_CUMULATIVE_PERCENTAGES[i];
    if (age <= bracket.maxAge) {
      const prevPercent = i === 0 ? 0 : AGE_CUMULATIVE_PERCENTAGES[i - 1].cumulativePercent;
      const prevMaxAge = i === 0 ? 0 : AGE_CUMULATIVE_PERCENTAGES[i - 1].maxAge;
      const bracketRange = bracket.maxAge - prevMaxAge;
      const ageInBracket = age - prevMaxAge;
      const percentRange = bracket.cumulativePercent - prevPercent;
      const percentile = prevPercent + (ageInBracket / bracketRange) * percentRange;
      return Math.round(percentile);
    }
  }
  return 99;
};

/**
 * Gender distribution in world population (2025)
 * Source: UN World Population Prospects 2024 via StatisticsTimes.com
 * Males: 50.27%, Females: 49.73%
 */
export const GENDER_PERCENTAGES = {
  male: 50.27,
  female: 49.73,
};

/**
 * Get percentile results for given inputs
 * Now supports: age-only, gender-only, weight-only, height-only, or any combination
 */
export const getPercentiles = (
  age: number | null,
  gender: 'male' | 'female' | null,
  heightCm: number | null,
  weightKg: number | null
): PercentileResult[] => {
  const results: PercentileResult[] = [];

  // Age percentile - what % of world population is younger than you
  if (age !== null) {
    const agePercentile = calculateAgePercentile(age);
    results.push({
      dimension: 'age',
      value: age,
      percentile: agePercentile,
      label: `Age: ${age} years`,
    });
  }

  // Gender percentile - what % of world population shares your gender
  if (gender !== null) {
    const genderPercent = Math.round(GENDER_PERCENTAGES[gender]);
    results.push({
      dimension: 'gender',
      value: gender,
      percentile: genderPercent,
      label: `Gender: ${gender === 'male' ? 'Male' : 'Female'}`,
    });
  }

  // Height and weight percentiles (need gender for comparison)
  if (gender) {
    const ageToUse = age ? getClosestAge(age) : 30; // Default to 30 if no age
    const genderData = PERCENTILE_DATA[gender];
    const ageData = genderData[ageToUse];

    if (ageData) {
      if (heightCm !== null) {
        const percentile = calculatePercentile(heightCm, ageData.height);
        results.push({
          dimension: 'height',
          value: heightCm,
          percentile,
          label: `Height: ${heightCm} cm`,
        });
      }

      if (weightKg !== null) {
        const percentile = calculatePercentile(weightKg, ageData.weight);
        results.push({
          dimension: 'weight',
          value: weightKg,
          percentile,
          label: `Weight: ${weightKg} kg`,
        });
      }
    }
  } else {
    // Without gender, show weight/height for both genders
    if (heightCm !== null || weightKg !== null) {
      const ageToUse = age ? getClosestAge(age) : 30;

      for (const g of ['male', 'female'] as const) {
        const genderData = PERCENTILE_DATA[g];
        const ageData = genderData[ageToUse];

        if (ageData) {
          if (heightCm !== null) {
            const percentile = calculatePercentile(heightCm, ageData.height);
            results.push({
              dimension: 'height',
              value: heightCm,
              percentile,
              label: `Height: ${heightCm} cm (vs ${g === 'male' ? 'men' : 'women'})`,
            });
          }

          if (weightKg !== null) {
            const percentile = calculatePercentile(weightKg, ageData.weight);
            results.push({
              dimension: 'weight',
              value: weightKg,
              percentile,
              label: `Weight: ${weightKg} kg (vs ${g === 'male' ? 'men' : 'women'})`,
            });
          }
        }
      }
    }
  }

  return results;
};

export const DATA_SOURCE = 'CDC Growth Charts, WHO & UN World Population Prospects (2025)';

/**
 * World population constant (2025)
 */
export const WORLD_POPULATION = 8_231_613_070;

/**
 * Funnel step representing cumulative filtering of population
 */
export interface FunnelStep {
  dimension: 'world' | 'age' | 'gender' | 'height' | 'weight';
  label: string;
  description: string;
  population: number;
  percentage: number; // percentage of world population
}

/**
 * Calculate funnel data - progressive narrowing of population
 * Each step shows how many people match all criteria up to that point
 */
export const calculateFunnel = (
  age: number | null,
  gender: 'male' | 'female' | null,
  heightCm: number | null,
  weightKg: number | null
): FunnelStep[] => {
  const steps: FunnelStep[] = [];
  let currentPopulation = WORLD_POPULATION;

  // Step 0: World population (always shown)
  steps.push({
    dimension: 'world',
    label: 'World Population',
    description: 'Everyone on Earth',
    population: currentPopulation,
    percentage: 100,
  });

  // Step 1: Filter by age (people in same age bracket ±2 years)
  if (age !== null) {
    // Find the age bracket population percentage
    // We use a ±2 year window for "same age"
    const ageWindowPercent = getAgeWindowPercentage(age, 2);
    currentPopulation = Math.round(currentPopulation * (ageWindowPercent / 100));
    steps.push({
      dimension: 'age',
      label: `Age ${age}`,
      description: `People aged ${Math.max(0, age - 2)}-${age + 2}`,
      population: currentPopulation,
      percentage: (currentPopulation / WORLD_POPULATION) * 100,
    });
  }

  // Step 2: Filter by gender
  if (gender !== null) {
    const genderPercent = GENDER_PERCENTAGES[gender];
    currentPopulation = Math.round(currentPopulation * (genderPercent / 100));
    steps.push({
      dimension: 'gender',
      label: gender === 'male' ? 'Male' : 'Female',
      description: `${gender === 'male' ? 'Men' : 'Women'}${age !== null ? ` aged ~${age}` : ''}`,
      population: currentPopulation,
      percentage: (currentPopulation / WORLD_POPULATION) * 100,
    });
  }

  // Step 3: Filter by height (within ±2cm)
  if (heightCm !== null && gender !== null) {
    const heightPercentile = getHeightRangePercentage(heightCm, age, gender, 2);
    currentPopulation = Math.round(currentPopulation * (heightPercentile / 100));
    steps.push({
      dimension: 'height',
      label: `${heightCm} cm tall`,
      description: `Height ${heightCm - 2}-${heightCm + 2} cm`,
      population: currentPopulation,
      percentage: (currentPopulation / WORLD_POPULATION) * 100,
    });
  }

  // Step 4: Filter by weight (within ±3kg)
  if (weightKg !== null && gender !== null) {
    const weightPercentile = getWeightRangePercentage(weightKg, age, gender, 3);
    currentPopulation = Math.round(currentPopulation * (weightPercentile / 100));
    steps.push({
      dimension: 'weight',
      label: `${weightKg} kg`,
      description: `Weight ${weightKg - 3}-${weightKg + 3} kg`,
      population: currentPopulation,
      percentage: (currentPopulation / WORLD_POPULATION) * 100,
    });
  }

  return steps;
};

/**
 * Get percentage of population in an age window (±years around target age)
 */
const getAgeWindowPercentage = (age: number, windowYears: number): number => {
  const minAge = Math.max(0, age - windowYears);
  const maxAge = age + windowYears;

  // Get cumulative percentages for the window bounds
  const getCumulativePercent = (targetAge: number): number => {
    if (targetAge <= 0) return 0;
    for (let i = 0; i < AGE_CUMULATIVE_PERCENTAGES.length; i++) {
      const bracket = AGE_CUMULATIVE_PERCENTAGES[i];
      if (targetAge <= bracket.maxAge) {
        const prevPercent = i === 0 ? 0 : AGE_CUMULATIVE_PERCENTAGES[i - 1].cumulativePercent;
        const prevMaxAge = i === 0 ? 0 : AGE_CUMULATIVE_PERCENTAGES[i - 1].maxAge;
        const bracketRange = bracket.maxAge - prevMaxAge;
        const ageInBracket = targetAge - prevMaxAge;
        const percentRange = bracket.cumulativePercent - prevPercent;
        return prevPercent + (ageInBracket / bracketRange) * percentRange;
      }
    }
    return 100;
  };

  const lowerPercent = getCumulativePercent(minAge);
  const upperPercent = getCumulativePercent(maxAge);
  return upperPercent - lowerPercent;
};

/**
 * Get percentage of population within a height range
 * Uses normal distribution approximation based on percentile data
 */
const getHeightRangePercentage = (
  heightCm: number,
  age: number | null,
  gender: 'male' | 'female',
  rangeCm: number
): number => {
  const ageToUse = age ? getClosestAge(age) : 30;
  const data = PERCENTILE_DATA[gender][ageToUse]?.height;
  if (!data) return 10; // fallback

  // Calculate percentile for height-range and height+range
  const lowerPercentile = calculatePercentile(heightCm - rangeCm, data);
  const upperPercentile = calculatePercentile(heightCm + rangeCm, data);

  return upperPercentile - lowerPercentile;
};

/**
 * Get percentage of population within a weight range
 */
const getWeightRangePercentage = (
  weightKg: number,
  age: number | null,
  gender: 'male' | 'female',
  rangeKg: number
): number => {
  const ageToUse = age ? getClosestAge(age) : 30;
  const data = PERCENTILE_DATA[gender][ageToUse]?.weight;
  if (!data) return 10; // fallback

  const lowerPercentile = calculatePercentile(weightKg - rangeKg, data);
  const upperPercentile = calculatePercentile(weightKg + rangeKg, data);

  return upperPercentile - lowerPercentile;
};

