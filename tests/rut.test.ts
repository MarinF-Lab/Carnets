import { describe, expect, it } from "vitest";
import { cleanRut, computeDv, formatRut, isValidRut, rutFromText } from "@/lib/rut";

describe("rut", () => {
  it("calcula el dígito verificador", () => {
    expect(computeDv("12345678")).toBe("5");
    expect(computeDv("11111111")).toBe("1");
    expect(computeDv("10000013")).toBe("K");
    expect(computeDv("7654321")).toBe("6");
  });

  it("valida RUTs en distintos formatos", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("10.000.013-k")).toBe(true);
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("0-0")).toBe(false);
  });

  it("limpia y formatea", () => {
    expect(cleanRut("12.345.678-k")).toBe("12345678K");
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("7654321-6")).toBe("7.654.321-6");
    expect(formatRut("10000013k")).toBe("10.000.013-K");
  });

  it("extrae el RUN desde texto de OCR, prefiriendo uno válido", () => {
    expect(rutFromText("RUN 12.345.678-5\nNUMERO DOCUMENTO 123.456.789")).toBe("12.345.678-5");
    expect(rutFromText("RUN 12 345 678 - 5")).toBe("12.345.678-5");
    expect(rutFromText("doc 12.345.678-9 run 7.654.321-6")).toBe("7.654.321-6");
    expect(rutFromText("sin datos")).toBeNull();
  });

  it("extrae el RUN desde la línea 2 de la MRZ", () => {
    const mrz = "INCHL5001234564<<<<<<<<<<<<<<<\n8001012M3001015CHL12345678<5<4".replace(/</g, " ");
    expect(rutFromText(mrz)).toBe("12.345.678-5");
  });
});

import { combinedFileName, pdfFileName, uniqueName, zipFileName } from "@/lib/pdf";

describe("nombres de archivo", () => {
  it("arma el nombre del PDF sin caracteres prohibidos", () => {
    expect(pdfFileName("Juan Pérez", "Constructora: Sur/Norte")).toBe("Juan Pérez - Constructora SurNorte.pdf");
    expect(zipFileName('Obras "Andes"')).toBe("Obras Andes.zip");
    expect(combinedFileName("Sur/Norte", 12)).toBe("SurNorte - 12 carnets.pdf");
    expect(combinedFileName("Sur", 1)).toBe("Sur - 1 carnet.pdf");
  });

  it("agrega (2), (3) a los nombres repetidos", () => {
    const used = new Set<string>();
    expect(uniqueName("A - B.pdf", used)).toBe("A - B.pdf");
    expect(uniqueName("A - B.pdf", used)).toBe("A - B (2).pdf");
    expect(uniqueName("a - b.pdf", used)).toBe("a - b (3).pdf");
  });
});
