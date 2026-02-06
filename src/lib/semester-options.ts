const START_YEAR = 2022;
const END_YEAR = 2030;

function buildSemesterOptions() {
  const options: string[] = [];
  for (let year = START_YEAR; year <= END_YEAR; year += 1) {
    options.push(`1C-${year}`);
    options.push(`2C-${year}`);
  }
  return options;
}

export const SEMESTER_OPTIONS = buildSemesterOptions();

export function isValidSemester(value: string) {
  return SEMESTER_OPTIONS.includes(value);
}
