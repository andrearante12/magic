import type { CardData, CardInstance } from "@mtg/shared";

export interface FaceView {
  img: string | null;
  name: string;
  typeLine: string;
  manaCost: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

/** Resolve the visible face of an instance, honoring DFC flip state. */
export function faceOf(inst: CardInstance, data: CardData | null): FaceView {
  if (!data) return { img: null, name: "", typeLine: "", manaCost: "", oracleText: "" };
  const faces = data.faces;
  if (faces && faces.length >= 2) {
    const f = inst.flipped ? faces[1] : faces[0];
    return {
      img: f.image || data.image || null,
      name: f.name,
      typeLine: f.typeLine,
      manaCost: f.manaCost,
      oracleText: f.oracleText,
      power: f.power,
      toughness: f.toughness,
      loyalty: f.loyalty,
    };
  }
  return {
    img: data.image || null,
    name: data.name,
    typeLine: data.typeLine,
    manaCost: data.manaCost,
    oracleText: data.oracleText,
    power: data.power,
    toughness: data.toughness,
    loyalty: data.loyalty,
  };
}
