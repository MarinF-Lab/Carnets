import { describe, expect, it } from "vitest";
import { nameFromFront, nameFromMrz } from "@/lib/mrz";

describe("nameFromMrz", () => {
  it("lee nombres y apellidos de la línea 3", () => {
    const mrz = [
      "INCHL1234567894<<<<<<<<<<<<<<<",
      "8001012M3001015CHL12345678<5<4",
      "PEREZ<SOTO<<JUAN<ANDRES<<<<<<<",
    ].join("\n");
    expect(nameFromMrz(mrz)).toBe("Juan Andres Perez Soto");
  });

  it("tolera espacios y ruido del OCR", () => {
    const mrz = "IDCHL 123\n8001012M3001015CHL\nGONZALEZ < MUNOZ << MARIA < JOSE <<< <<<";
    expect(nameFromMrz(mrz)).toBe("Maria Jose Gonzalez Munoz");
  });

  it("soporta un solo apellido y un solo nombre", () => {
    expect(nameFromMrz("LI<<WEI<<<<<<<<<<<<<<<<<<<<<<<")).toBe("Wei Li");
  });

  it("devuelve null si no hay línea de nombre", () => {
    expect(nameFromMrz("INCHL1234567894<<<<<\n8001012M3001015CHL")).toBeNull();
    expect(nameFromMrz("")).toBeNull();
  });
});

describe("nameFromFront", () => {
  it("lee el texto bajo APELLIDOS y NOMBRES", () => {
    const text = [
      "REPUBLICA DE CHILE",
      "CEDULA DE IDENTIDAD",
      "APELLIDOS",
      "PÉREZ",
      "SOTO",
      "NOMBRES",
      "JUAN ANDRÉS",
      "NACIONALIDAD SEXO",
      "CHILENA M",
    ].join("\n");
    expect(nameFromFront(text)).toBe("Juan Andrés Pérez Soto");
  });

  it("acepta el valor en la misma línea que la etiqueta", () => {
    expect(nameFromFront("APELLIDOS ROJAS DIAZ\nNOMBRES ANA MARIA\nFECHA DE NACIMIENTO")).toBe(
      "Ana Maria Rojas Diaz",
    );
  });

  it("devuelve null sin etiquetas", () => {
    expect(nameFromFront("texto cualquiera")).toBeNull();
  });
});
