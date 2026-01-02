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
// For babies (0-2 years), ages are stored as decimals (e.g., 0.5 = 6 months)

export const PERCENTILE_DATA: Record<string, Record<number, AgeGenderData>> = {
  male: {
    // Babies (0-23 months) - WHO Child Growth Standards
    0: { height: { p5: 46.3, p10: 47.5, p25: 49.1, p50: 50.5, p75: 51.8, p90: 53.4, p95: 54.4 }, weight: { p5: 2.5, p10: 2.8, p25: 3.1, p50: 3.5, p75: 3.9, p90: 4.3, p95: 4.6 } },
    0.25: { height: { p5: 53.4, p10: 54.7, p25: 56.5, p50: 58.4, p75: 60.2, p90: 62.0, p95: 63.2 }, weight: { p5: 4.1, p10: 4.5, p25: 5.0, p50: 5.6, p75: 6.2, p90: 6.9, p95: 7.4 } },
    0.5: { height: { p5: 61.1, p10: 62.5, p25: 64.4, p50: 66.4, p75: 68.4, p90: 70.3, p95: 71.6 }, weight: { p5: 5.9, p10: 6.4, p25: 7.1, p50: 7.9, p75: 8.8, p90: 9.7, p95: 10.3 } },
    0.75: { height: { p5: 65.5, p10: 66.9, p25: 68.9, p50: 71.0, p75: 73.1, p90: 75.1, p95: 76.5 }, weight: { p5: 7.0, p10: 7.5, p25: 8.3, p50: 9.2, p75: 10.2, p90: 11.2, p95: 11.9 } },
    1: { height: { p5: 69.5, p10: 71.0, p25: 73.1, p50: 75.2, p75: 77.4, p90: 79.5, p95: 80.9 }, weight: { p5: 7.8, p10: 8.4, p25: 9.2, p50: 10.2, p75: 11.3, p90: 12.4, p95: 13.1 } },
    1.25: { height: { p5: 72.3, p10: 73.8, p25: 76.0, p50: 78.3, p75: 80.5, p90: 82.7, p95: 84.2 }, weight: { p5: 8.5, p10: 9.1, p25: 10.0, p50: 11.0, p75: 12.1, p90: 13.3, p95: 14.1 } },
    1.5: { height: { p5: 75.0, p10: 76.6, p25: 78.9, p50: 81.2, p75: 83.5, p90: 85.8, p95: 87.3 }, weight: { p5: 9.1, p10: 9.7, p25: 10.7, p50: 11.8, p75: 12.9, p90: 14.2, p95: 15.0 } },
    1.75: { height: { p5: 77.5, p10: 79.1, p25: 81.5, p50: 83.9, p75: 86.3, p90: 88.7, p95: 90.2 }, weight: { p5: 9.6, p10: 10.3, p25: 11.3, p50: 12.4, p75: 13.7, p90: 15.0, p95: 15.9 } },
    // Children and teens (2+ years)
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
    // Babies (0-23 months) - WHO Child Growth Standards
    0: { height: { p5: 45.6, p10: 46.6, p25: 48.2, p50: 49.5, p75: 50.8, p90: 52.3, p95: 53.3 }, weight: { p5: 2.4, p10: 2.6, p25: 2.9, p50: 3.3, p75: 3.7, p90: 4.0, p95: 4.3 } },
    0.25: { height: { p5: 52.2, p10: 53.4, p25: 55.1, p50: 56.9, p75: 58.7, p90: 60.4, p95: 61.5 }, weight: { p5: 3.8, p10: 4.1, p25: 4.6, p50: 5.1, p75: 5.7, p90: 6.3, p95: 6.7 } },
    0.5: { height: { p5: 59.5, p10: 60.8, p25: 62.7, p50: 64.7, p75: 66.6, p90: 68.5, p95: 69.7 }, weight: { p5: 5.4, p10: 5.8, p25: 6.5, p50: 7.3, p75: 8.1, p90: 8.9, p95: 9.5 } },
    0.75: { height: { p5: 63.7, p10: 65.1, p25: 67.1, p50: 69.2, p75: 71.2, p90: 73.2, p95: 74.5 }, weight: { p5: 6.4, p10: 6.9, p25: 7.6, p50: 8.5, p75: 9.4, p90: 10.4, p95: 11.0 } },
    1: { height: { p5: 67.5, p10: 68.9, p25: 71.0, p50: 73.2, p75: 75.3, p90: 77.4, p95: 78.8 }, weight: { p5: 7.1, p10: 7.7, p25: 8.5, p50: 9.5, p75: 10.5, p90: 11.6, p95: 12.3 } },
    1.25: { height: { p5: 70.1, p10: 71.6, p25: 73.8, p50: 76.0, p75: 78.2, p90: 80.4, p95: 81.8 }, weight: { p5: 7.7, p10: 8.3, p25: 9.2, p50: 10.2, p75: 11.3, p90: 12.5, p95: 13.2 } },
    1.5: { height: { p5: 72.6, p10: 74.1, p25: 76.4, p50: 78.7, p75: 81.0, p90: 83.3, p95: 84.8 }, weight: { p5: 8.2, p10: 8.9, p25: 9.8, p50: 10.9, p75: 12.0, p90: 13.3, p95: 14.0 } },
    1.75: { height: { p5: 74.9, p10: 76.5, p25: 78.9, p50: 81.3, p75: 83.7, p90: 86.0, p95: 87.6 }, weight: { p5: 8.7, p10: 9.4, p25: 10.4, p50: 11.5, p75: 12.7, p90: 14.0, p95: 14.8 } },
    // Children and teens (2+ years)
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
 * Eye Color Distribution (Global estimates based on population genetics research)
 * Sources: Various population genetics studies, World Atlas demographics
 * Note: These are approximate global percentages
 */
export type EyeColor = 'brown' | 'blue' | 'hazel' | 'amber' | 'green' | 'gray';

export const EYE_COLOR_PERCENTAGES: Record<EyeColor, number> = {
  brown: 70,      // Most common globally (dominant gene)
  blue: 8,        // Common in European ancestry
  hazel: 5,       // Mix of brown and green
  amber: 5,       // Golden/copper tones
  green: 2,       // Rarest natural eye color
  gray: 3,        // Rare, often considered blue variant
};

export const EYE_COLOR_LABELS: Record<EyeColor, string> = {
  brown: 'Brown',
  blue: 'Blue',
  hazel: 'Hazel',
  amber: 'Amber',
  green: 'Green',
  gray: 'Gray',
};

/**
 * Hair Color Distribution (Global estimates)
 * Sources: Population genetics research, demographic studies
 */
export type HairColor = 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'auburn';

export const HAIR_COLOR_PERCENTAGES: Record<HairColor, number> = {
  black: 75,      // Most common globally
  brown: 11,      // Common in European/Middle Eastern ancestry
  blonde: 2,      // Primarily Northern European ancestry
  red: 1,         // Rarest natural hair color (~1-2%)
  gray: 7,        // Natural aging (varies by age)
  auburn: 2,      // Reddish-brown
};

export const HAIR_COLOR_LABELS: Record<HairColor, string> = {
  black: 'Black',
  brown: 'Brown',
  blonde: 'Blonde',
  red: 'Red',
  gray: 'Gray/White',
  auburn: 'Auburn',
};

/**
 * Skin Tone Distribution (Global estimates using Fitzpatrick scale categories)
 * Using inclusive, descriptive terminology based on melanin levels
 * Sources: Dermatology research, global demographic studies
 */
export type SkinTone = 'very_light' | 'light' | 'medium' | 'olive' | 'tan' | 'deep';

export const SKIN_TONE_PERCENTAGES: Record<SkinTone, number> = {
  very_light: 8,   // Type I-II: Very fair, burns easily
  light: 12,       // Type II-III: Fair, sometimes burns
  medium: 18,      // Type III: Medium, tans gradually
  olive: 22,       // Type IV: Olive/moderate brown
  tan: 25,         // Type V: Brown, rarely burns
  deep: 15,        // Type VI: Deep brown to dark
};

export const SKIN_TONE_LABELS: Record<SkinTone, string> = {
  very_light: 'Very Light',
  light: 'Light',
  medium: 'Medium',
  olive: 'Olive',
  tan: 'Tan',
  deep: 'Deep',
};

/**
 * Ethnicity/Ancestry Distribution (Global estimates based on UN population data)
 * Using broad geographic ancestry categories
 * Sources: UN World Population Prospects, demographic research
 */
export type Ethnicity = 'east_asian' | 'south_asian' | 'southeast_asian' | 'european' | 'african' | 'middle_eastern' | 'latin_american' | 'oceanian' | 'mixed';

export const ETHNICITY_PERCENTAGES: Record<Ethnicity, number> = {
  east_asian: 20,       // China, Japan, Korea, Mongolia
  south_asian: 24,      // India, Pakistan, Bangladesh, Sri Lanka
  southeast_asian: 9,   // Vietnam, Thailand, Philippines, Indonesia
  european: 9,          // Europe, European diaspora
  african: 18,          // Sub-Saharan Africa
  middle_eastern: 6,    // Middle East, North Africa
  latin_american: 8,    // Central/South America (mixed heritage)
  oceanian: 0.5,        // Australia, Pacific Islands indigenous
  mixed: 5.5,           // Multi-ethnic/mixed heritage
};

export const ETHNICITY_LABELS: Record<Ethnicity, string> = {
  east_asian: 'East Asian',
  south_asian: 'South Asian',
  southeast_asian: 'Southeast Asian',
  european: 'European',
  african: 'African',
  middle_eastern: 'Middle Eastern / North African',
  latin_american: 'Latin American',
  oceanian: 'Oceanian / Pacific Islander',
  mixed: 'Mixed / Multi-ethnic',
};

/**
 * Get the closest age bracket for percentile lookup
 * Supports babies (0-2 years with decimal ages like 0.5 for 6 months)
 */
export const getClosestAge = (age: number): number => {
  // Baby ages (0-2 years) stored as decimals
  const babyAges = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];
  // Child and adult ages
  const olderAges = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

  if (age < 0) return 0;
  if (age > 80) return 80;

  // For babies under 2, use baby age brackets
  if (age < 2) {
    return babyAges.reduce((prev, curr) => Math.abs(curr - age) < Math.abs(prev - age) ? curr : prev);
  }

  return olderAges.reduce((prev, curr) => Math.abs(curr - age) < Math.abs(prev - age) ? curr : prev);
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
  dimension: 'world' | 'age' | 'gender' | 'height' | 'weight' | 'eyeColor' | 'hairColor' | 'skinTone' | 'ethnicity';
  label: string;
  description: string;
  population: number;
  percentage: number; // percentage of world population
}

/**
 * Get percentage of population in an age window (±years around target age)
 */
const getAgeWindowPercentage = (age: number, windowYears: number): number => {
  const minAge = Math.max(0, age - windowYears);
  const maxAge = age + windowYears;

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
  return Math.max(0.1, upperPercent - lowerPercent);
};

/**
 * Get percentage of population within a height range
 * Supports any combination: with/without gender, with/without age (including babies)
 */
const getHeightRangePercentage = (
  heightCm: number,
  age: number | null,
  gender: 'male' | 'female' | null,
  rangeCm: number
): number => {
  const ageToUse = age !== null ? getClosestAge(age) : 30;

  if (gender) {
    const data = PERCENTILE_DATA[gender][ageToUse]?.height;
    if (!data) return 10;
    const lower = calculatePercentile(heightCm - rangeCm, data);
    const upper = calculatePercentile(heightCm + rangeCm, data);
    return Math.max(1, upper - lower);
  } else {
    // Average of both genders
    const maleData = PERCENTILE_DATA.male[ageToUse]?.height;
    const femaleData = PERCENTILE_DATA.female[ageToUse]?.height;
    if (!maleData || !femaleData) return 10;

    const maleLower = calculatePercentile(heightCm - rangeCm, maleData);
    const maleUpper = calculatePercentile(heightCm + rangeCm, maleData);
    const femaleLower = calculatePercentile(heightCm - rangeCm, femaleData);
    const femaleUpper = calculatePercentile(heightCm + rangeCm, femaleData);

    const maleRange = Math.max(1, maleUpper - maleLower);
    const femaleRange = Math.max(1, femaleUpper - femaleLower);
    return (maleRange + femaleRange) / 2;
  }
};

/**
 * Get percentage of population within a weight range
 * Supports any combination: with/without gender, with/without age (including babies)
 */
const getWeightRangePercentage = (
  weightKg: number,
  age: number | null,
  gender: 'male' | 'female' | null,
  rangeKg: number
): number => {
  const ageToUse = age !== null ? getClosestAge(age) : 30;

  if (gender) {
    const data = PERCENTILE_DATA[gender][ageToUse]?.weight;
    if (!data) return 10;
    const lower = calculatePercentile(weightKg - rangeKg, data);
    const upper = calculatePercentile(weightKg + rangeKg, data);
    return Math.max(1, upper - lower);
  } else {
    const maleData = PERCENTILE_DATA.male[ageToUse]?.weight;
    const femaleData = PERCENTILE_DATA.female[ageToUse]?.weight;
    if (!maleData || !femaleData) return 10;

    const maleLower = calculatePercentile(weightKg - rangeKg, maleData);
    const maleUpper = calculatePercentile(weightKg + rangeKg, maleData);
    const femaleLower = calculatePercentile(weightKg - rangeKg, femaleData);
    const femaleUpper = calculatePercentile(weightKg + rangeKg, femaleData);

    const maleRange = Math.max(1, maleUpper - maleLower);
    const femaleRange = Math.max(1, femaleUpper - femaleLower);
    return (maleRange + femaleRange) / 2;
  }
};

// Baby population percentage (0-2 years) - approximately 2.5% of world population
const BABY_POPULATION_PERCENT = 2.5;
const BABY_POPULATION = Math.round(WORLD_POPULATION * (BABY_POPULATION_PERCENT / 100));
const NON_BABY_POPULATION = WORLD_POPULATION - BABY_POPULATION;

/**
 * Calculate funnel data - progressive narrowing of population
 * Supports ANY combination of inputs including physical traits
 * For babies: starts with baby population
 * For non-babies: starts with non-baby population
 */
export const calculateFunnel = (
  age: number | null,
  gender: 'male' | 'female' | null,
  heightCm: number | null,
  weightKg: number | null,
  eyeColor: EyeColor | null = null,
  hairColor: HairColor | null = null,
  skinTone: SkinTone | null = null,
  ethnicity: Ethnicity | null = null
): FunnelStep[] => {
  const steps: FunnelStep[] = [];

  // Determine if this is a baby (age < 2 years)
  const isBaby = age !== null && age < 2;

  // Start with appropriate base population
  let basePopulation: number;
  let baseLabel: string;
  let baseDesc: string;

  if (age !== null) {
    if (isBaby) {
      basePopulation = BABY_POPULATION;
      baseLabel = 'All Babies';
      baseDesc = `All babies worldwide (0-2 years)`;
    } else {
      basePopulation = NON_BABY_POPULATION;
      baseLabel = 'World Population';
      baseDesc = 'Everyone on Earth (2+ years)';
    }
  } else {
    basePopulation = WORLD_POPULATION;
    baseLabel = 'World Population';
    baseDesc = 'Everyone on Earth';
  }

  let currentPopulation = basePopulation;

  // Step 0: Base population
  steps.push({
    dimension: 'world',
    label: baseLabel,
    description: baseDesc,
    population: currentPopulation,
    percentage: 100,
  });

  // Step 1: Filter by age within the base population
  if (age !== null) {
    // Use smaller window for babies/toddlers
    const windowYears = isBaby ? 0.25 : age < 5 ? 1 : 2;

    let ageWindowPercent: number;
    if (isBaby) {
      // For babies, calculate percentage within baby population
      // Each 3-month window is roughly 1/8 of the 0-2 year range = 12.5%
      ageWindowPercent = Math.max(5, (windowYears * 2 / 2) * 100); // ~12.5% for ±3 months
    } else {
      // For non-babies, use the age window percentage adjusted for non-baby population
      const rawPercent = getAgeWindowPercentage(age, windowYears);
      // Adjust: the percentage is of world pop, but we're starting from non-baby pop
      // Non-baby is ~97.5% of world, so scale accordingly
      ageWindowPercent = (rawPercent / (100 - BABY_POPULATION_PERCENT)) * 100;
    }

    currentPopulation = Math.round(currentPopulation * (ageWindowPercent / 100));

    // Format age label for babies (show months)
    let ageLabel: string;
    let ageDesc: string;
    if (isBaby) {
      const months = Math.round(age * 12);
      ageLabel = months === 0 ? 'Newborn' : `${months} month${months === 1 ? '' : 's'}`;
      const minMonths = Math.max(0, Math.round((age - windowYears) * 12));
      const maxMonths = Math.round((age + windowYears) * 12);
      ageDesc = `Babies ${minMonths}-${maxMonths} months old`;
    } else {
      ageLabel = `Age ${Math.round(age)}`;
      ageDesc = `People aged ${Math.max(0, Math.round(age - windowYears))}-${Math.round(age + windowYears)}`;
    }

    steps.push({
      dimension: 'age',
      label: ageLabel,
      description: ageDesc,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 2: Filter by gender
  if (gender !== null) {
    const genderPercent = GENDER_PERCENTAGES[gender];
    currentPopulation = Math.round(currentPopulation * (genderPercent / 100));
    const ageDesc = age !== null ? (isBaby ? ' babies' : ` aged ~${Math.round(age)}`) : '';
    steps.push({
      dimension: 'gender',
      label: gender === 'male' ? 'Male' : 'Female',
      description: `${gender === 'male' ? (isBaby ? 'Baby boys' : 'Males') : (isBaby ? 'Baby girls' : 'Females')}${ageDesc}`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 3: Filter by height (works with or without gender)
  if (heightCm !== null) {
    // Smaller range for babies, medium for children, larger for adults
    const rangeCm = age !== null ? (isBaby ? 0.5 : age < 10 ? 1 : 2) : 2;
    const heightPercent = getHeightRangePercentage(heightCm, age, gender, rangeCm);
    currentPopulation = Math.round(currentPopulation * (heightPercent / 100));
    steps.push({
      dimension: 'height',
      label: `${heightCm.toFixed(isBaby ? 1 : 0)} cm`,
      description: `Height ${(heightCm - rangeCm).toFixed(1)}-${(heightCm + rangeCm).toFixed(1)} cm`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 4: Filter by weight (works with or without gender)
  if (weightKg !== null) {
    // Smaller range for babies, medium for children, larger for adults
    const rangeKg = age !== null ? (isBaby ? 0.2 : age < 10 ? 0.5 : 3) : 3;
    const weightPercent = getWeightRangePercentage(weightKg, age, gender, rangeKg);
    currentPopulation = Math.round(currentPopulation * (weightPercent / 100));
    steps.push({
      dimension: 'weight',
      label: `${weightKg.toFixed(isBaby ? 1 : 0)} kg`,
      description: `Weight ${(weightKg - rangeKg).toFixed(1)}-${(weightKg + rangeKg).toFixed(1)} kg`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 5: Filter by ethnicity
  if (ethnicity !== null) {
    const ethnicityPercent = ETHNICITY_PERCENTAGES[ethnicity];
    currentPopulation = Math.round(currentPopulation * (ethnicityPercent / 100));
    steps.push({
      dimension: 'ethnicity',
      label: ETHNICITY_LABELS[ethnicity],
      description: `${ETHNICITY_LABELS[ethnicity]} ancestry`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 6: Filter by skin tone
  if (skinTone !== null) {
    const skinPercent = SKIN_TONE_PERCENTAGES[skinTone];
    currentPopulation = Math.round(currentPopulation * (skinPercent / 100));
    steps.push({
      dimension: 'skinTone',
      label: `${SKIN_TONE_LABELS[skinTone]} skin`,
      description: `${SKIN_TONE_LABELS[skinTone]} skin tone`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 7: Filter by eye color
  if (eyeColor !== null) {
    const eyePercent = EYE_COLOR_PERCENTAGES[eyeColor];
    currentPopulation = Math.round(currentPopulation * (eyePercent / 100));
    steps.push({
      dimension: 'eyeColor',
      label: `${EYE_COLOR_LABELS[eyeColor]} eyes`,
      description: `${EYE_COLOR_LABELS[eyeColor]} eye color`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Step 8: Filter by hair color
  if (hairColor !== null) {
    const hairPercent = HAIR_COLOR_PERCENTAGES[hairColor];
    currentPopulation = Math.round(currentPopulation * (hairPercent / 100));
    steps.push({
      dimension: 'hairColor',
      label: `${HAIR_COLOR_LABELS[hairColor]} hair`,
      description: `${HAIR_COLOR_LABELS[hairColor]} hair color`,
      population: currentPopulation,
      percentage: (currentPopulation / basePopulation) * 100,
    });
  }

  // Ensure minimum population of 1
  if (steps.length > 1) {
    const lastStep = steps[steps.length - 1];
    if (lastStep.population < 1) {
      lastStep.population = 1;
      lastStep.percentage = (1 / basePopulation) * 100;
    }
  }

  return steps;
};

