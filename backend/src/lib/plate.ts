/**
 * Zimbabwean number plates (cars and motorbikes alike): three letters and four
 * digits, written "ABC 1234". Accepts any spacing, dashes and letter case.
 * Returns the standard form, or null when the input isn't a Zimbabwean plate.
 */
export function normalizeZwPlate(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]+/g, '');
  const match = /^([A-Z]{3})(\d{4})$/.exec(compact);
  return match ? `${match[1]} ${match[2]}` : null;
}

export const ZW_PLATE_HINT = 'Enter the number plate as on your bike, e.g. AEZ 1234 (three letters and four digits)';
