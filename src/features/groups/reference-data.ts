import type { GroupType, Voice } from "./model"

/**
 * The structure every environment shares, created by the migration `0012_groups-reference-data`.
 * This copy exists so the tests can check the migration and so code can name the reference
 * groups without querying for them first.
 */
export const REFERENCE_DATA: {
  choirs: { name: string; sections: { name: string; voices: Voice[] }[] }[]
  groups: { name: string; type: GroupType }[]
  positions: { name: string; groupTypes: GroupType[] }[]
} = {
  choirs: [
    {
      name: "MK",
      sections: [
        { name: "MKT1", voices: ["T1"] },
        { name: "MKT2", voices: ["T2"] },
        { name: "MKB1", voices: ["B1"] },
        { name: "MKB2", voices: ["B2"] }
      ]
    },
    {
      name: "DK",
      sections: [
        { name: "DKS1", voices: ["S1"] },
        { name: "DKS2", voices: ["S2"] },
        { name: "DKA1", voices: ["A1"] },
        { name: "DKA2", voices: ["A2"] }
      ]
    },
    {
      name: "KK",
      sections: [
        { name: "KKS", voices: ["S1", "S2"] },
        { name: "KKA", voices: ["A1", "A2"] },
        { name: "KKT", voices: ["T1", "T2"] },
        { name: "KKB", voices: ["B1", "B2"] }
      ]
    }
  ],
  groups: [{ name: "Styret", type: "Board" }],
  positions: [
    { name: "Ordförande", groupTypes: ["Board"] },
    { name: "PR-mästare", groupTypes: ["Board"] },
    { name: "Gigmästare", groupTypes: ["Board", "Gigmästeri"] },
    { name: "Sexmästare", groupTypes: ["Board", "Sexmästeri"] },
    { name: "Sexmästarinna", groupTypes: ["Board", "Sexmästeri"] },
    { name: "Conductor", groupTypes: ["Choir"] },
    { name: "Notfiskal", groupTypes: ["Choir"] },
    { name: "Konsertmästare", groupTypes: ["Choir"] },
    { name: "Stämförälder", groupTypes: ["Section"] }
  ]
}
