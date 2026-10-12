#!/usr/bin/env bun
import type { JSONContent } from "@tiptap/core"
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { post } from "@/core/db/schema/posts"
import { assertLocalDatabase } from "./ops/guards"
import { SEED_USERS, type SeedDatabase, seedId } from "./ops/seed-data"

// Fictional Swedish announcements for the shared feed, not actual CSK event information.
const ANNOUNCEMENTS = [
  [
    "Välkommen till en ny körtermin",
    "Manskören, Damkören och Kammarkören är igång igen. Vi ser fram emot en termin med repetitioner, konserter och gemensamma aktiviteter.",
    [
      "Kontrollera din kör och sektion på profilsidan.",
      "Berätta vilka röstdivisioner du kan sjunga.",
      "Hälsa våra nya sångare välkomna."
    ]
  ],
  [
    "Gemensam repetition inför höstkonserten",
    "Den här veckan möts MK, DK och KK för att sjunga tillsammans som CSK. De vanliga körrepetitionerna fortsätter också som planerat.",
    [
      "Ta med noter och penna.",
      "Lyssna på övningsfilerna före repetitionen.",
      "Meddela din Stämförälder om du inte kan komma."
    ]
  ],
  [
    "Nya noter finns hos Notfiskalerna",
    "Notfiskalerna har samlat terminens repertoar. Börja med att kontrollera att du har rätt stämma i varje arrangemang; en stämma i noterna är inte en ny sektion i kören.",
    [
      "MK: kontrollera T1, T2, B1 eller B2.",
      "DK: kontrollera S1, S2, A1 eller A2.",
      "KK: följ arrangemangets fördelning inom S, A, T och B."
    ]
  ],
  [
    "Anmäl intresse för vårens giggrupp",
    "Gigmästeriet planerar ett gemensamt framträdande. En tillfällig giggrupp samlar sångare från alla tre körerna och avslutas efter uppdraget.",
    [
      "Meddela vilken division du kan sjunga.",
      "Läs igenom repertoaren i förväg.",
      "Avvakta besked från Gigmästeriet om slutlig bemanning."
    ]
  ],
  [
    "Rephelg: packlista och förberedelser",
    "Körernas rephelgsgrupper förbereder en helg med musik, sektionsarbete och gemenskap. Gör gärna plats i väskan för både noter och varma kläder.",
    ["Notpärm, penna och vattenflaska.", "Öronproppar och bekväma skor.", "Meddela matbehov till din rephelgsgrupp."]
  ],
  [
    "Sexmästeriet bjuder in till körfika",
    "Efter repetitionen blir det gemensamt fika. Sexmästeriet ordnar serveringen tillsammans med medhjälpare som gärna tar emot en extra hand.",
    [
      "Hjälp till att ställa fram bord.",
      "Märk upp fika med ingredienser.",
      "Stanna gärna en stund och hjälp till att plocka undan."
    ]
  ],
  [
    "Styrets överlämning är klar",
    "Det nya Styret har tagit över arbetet. Organisationssidorna visar både aktuella innehavare och tidigare perioder, så att erfarenheter från tidigare år går att följa.",
    ["Ordförande samordnar Styrets arbete.", "Kassören följer ekonomin.", "Sekreteraren samlar mötesanteckningarna."]
  ],
  [
    "Konsertmästeriet söker medhjälpare",
    "Konsertmästeriet behöver hjälp med planering och praktiska förberedelser. Du kan vara medlem i gruppen utan att inneha en särskild Position.",
    ["Hjälp till med publikvärdskap.", "Var med och förbered scenen.", "Stäm av arbetsfördelningen före konserten."]
  ],
  [
    "Roddgruppernas gemensamma genomgång",
    "MK:s, DK:s och KK:s roddgrupper går igenom utrustningen tillsammans. Varje grupp tillhör sin kör, men arbetet inför den gemensamma konserten samordnas.",
    [
      "Kontrollera notställ och belysning.",
      "Räkna stolar och märk transportlådor.",
      "Lämna utrustningen på överenskommen plats."
    ]
  ],
  [
    "Rekrytering: välkomna nya sångare",
    "Rekryteringskommittén förbereder information för blivande medlemmar. En Admin bjuder in varje ny User till Hubben och placerar sångaren i kör och sektion.",
    [
      "Berätta om de tre körernas olika repertoarer.",
      "Hjälp nya sångare att hitta på repetitionen.",
      "Förmedla kontakt med rätt Stämförälder."
    ]
  ],
  [
    "Föräldramötet samlar Stämföräldrarna",
    "Stämföräldrarna från de tolv sektionerna möts för att dela erfarenheter. Det finns en Stämförälder per sektion, även när sektionen sjunger en hel röstfamilj.",
    ["Ta med frågor från din sektion.", "Dela bra sätt att välkomna nya sångare.", "Stäm av stöd inför nästa konsert."]
  ],
  [
    "Utantillkommitténs övningstips",
    "Korta, regelbundna övningspass gör det lättare att lämna notpärmen. Utantillkommittén har samlat idéer som fungerar både ensam och tillsammans med sektionen.",
    [
      "Arbeta med en fras i taget.",
      "Öva text och rytm innan du lägger till tonerna.",
      "Sjung igenom tillsammans och hjälps åt."
    ]
  ],
  [
    "Arkivet efterlyser gamla konsertprogram",
    "Arkivgruppen samlar minnen från tidigare konserter. Program, foton och anteckningar hjälper oss att förstå hur föreningens musik och traditioner har vuxit fram.",
    [
      "Skriv vilket år materialet kommer från.",
      "Ange fotograf när det är känt.",
      "Kontakta arkivgruppen innan du lämnar original."
    ]
  ],
  [
    "Vårens sektionsrepetitioner",
    "Varje kör planerar extra tid för sektionsarbete. I KK kan en sektion arbeta i två divisioner utan att den delas upp i nya grupper.",
    [
      "Stämföräldrarna samlar frågor om svåra passager.",
      "Dirigenterna prioriterar gemensamma problem.",
      "Notfiskalerna hjälper till med aktuella noter."
    ]
  ],
  [
    "Valberedningen berättar om årets arbete",
    "Valberedningen samlar intresse för föreningens valda Positioner. En Position i Styret är ett organisatoriskt uppdrag och ger inte automatiskt Admin-behörighet i Hubben.",
    [
      "Fundera på vilket arbete du vill bidra med.",
      "Fråga nuvarande innehavare hur uppdraget fungerar.",
      "Lämna förslag till Valberedningen."
    ]
  ],
  [
    "Tack för jubileumskonserten",
    "Jubileumskommittén har avslutat sitt uppdrag. Gruppen arkiveras, medan Memberships och Positioner med sina perioder finns kvar som historia.",
    [
      "Återlämna lånad utrustning.",
      "Lämna dokumentation till arkivgruppen.",
      "Dela erfarenheter med nästa projektgrupp."
    ]
  ],
  [
    "Damkörens nya konsertprogram",
    "DK arbetar med ett program där S1, S2, A1 och A2 får tydliga egna linjer. Konsertmästaren och Notfiskalen samordnar program och noter.",
    ["Kontrollera senaste versionen av noterna.", "Markera gemensamma andningar.", "Ta frågor till nästa repetition."]
  ],
  [
    "Manskören förbereder vårframträdandet",
    "MK:s fyra sektioner arbetar vidare med vårens program. T1, T2, B1 och B2 övar först separat innan kören samlar klangen igen.",
    [
      "Följ Dirigentens repetitionsordning.",
      "Öva ingångarna mellan sektionerna.",
      "Hjälp en sektionskamrat med svåra passager."
    ]
  ],
  [
    "Kammarkören arbetar med gemensam klang",
    "KK sjunger i sektionerna S, A, T och B. Varje sångare är placerad i en division, så det går att fördela ett arrangemangs delade stämmor utan att byta sektion.",
    [
      "Lyssna på klangen genom hela frasen.",
      "Håll kontakten med din sektionskamrat.",
      "Stäm av divisionerna för varje arrangemang."
    ]
  ],
  [
    "Planeringen för turnén 2027 börjar",
    "Turnékommittén undersöker idéer för nästa gemensamma resa. Den ekonomiskt ansvariga samlar underlag innan föreningen fattar beslut om upplägget.",
    ["Samla förslag på repertoar.", "Undersök praktiska behov för transport.", "Lämna uppskattningar till kommittén."]
  ],
  [
    "Webmästeriets tips för Hubben",
    "På din profilsida ser du körer, grupper och Positioner. Röstförmågor är dina egna uppgifter; den division du är placerad i ändras av en Admin.",
    [
      "Uppdatera vilka divisioner du kan sjunga.",
      "Kontrollera att din organisationsinformation stämmer.",
      "Kontakta en Admin om din placering behöver ändras."
    ]
  ],
  [
    "Festgrupperna planerar terminsavslutningen",
    "Körernas festgrupper förbereder terminsavslutningen tillsammans. Det finns plats både för musik och för att träffa sångare från de andra körerna.",
    ["Bidra med idéer till programmet.", "Ange matbehov i god tid.", "Hjälp till med förberedelser och återställning."]
  ],
  [
    "Gigmästarna samordnar körernas uppdrag",
    "Varje kör har en egen Gigmästare som också arbetar i det gemensamma Gigmästeriet. Det är samma namngivna Position i två grupper, med en tydlig köranknytning.",
    [
      "Kontakta rätt Gigmästare för din kör.",
      "Var tydlig med vilka divisioner du kan täcka.",
      "Invänta besked innan ett nytt gig bekräftas."
    ]
  ],
  [
    "Tack för en fin körtermin",
    "Tack till alla sångare, Dirigenter, Stämföräldrar och medhjälpare för terminens arbete. Nästa termin fortsätter vi med tre körer och en gemensam förening.",
    [
      "Återlämna gemensamma noter enligt instruktion.",
      "Lämna erfarenheter till din grupp.",
      "Håll utkik i Nyhetsflödet efter nästa gemensamma information."
    ]
  ]
] as const

/** Inserts 24 published Posts with varied, supported editor documents and historical timestamps. Reruns preserve edits. */
export async function seedPosts(database: SeedDatabase) {
  return database.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(
        and(
          inArray(
            user.id,
            SEED_USERS.slice(0, 3).map(({ id }) => id)
          ),
          or(eq(user.banned, false), isNull(user.banned))
        )
      )
      .orderBy(asc(user.id))
    const authors = candidates.filter(({ role }) => role?.split(",").includes("admin"))
    if (!authors.length) throw new Error("No example Admin exists; run `bun run ops seed-users` first.")
    let created = 0
    for (const [index, [title, introduction, items]] of ANNOUNCEMENTS.entries()) {
      const publishedAt = new Date(
        Date.UTC(2026, 9, 5 - (ANNOUNCEMENTS.length - 1 - index) * 18, 16, index % 2 ? 30 : 0)
      )
      const body: JSONContent = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: introduction }] },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: index % 2 ? "Inför nästa träff" : "Att tänka på" }]
          },
          {
            type: index % 3 === 0 ? "orderedList" : "bulletList",
            ...(index % 3 === 0 ? { attrs: { start: 1, type: null } } : {}),
            content: items.map((text) => ({
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text }] }]
            }))
          },
          ...(index % 4 === 0
            ? [
                {
                  type: "blockquote",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Tre körer, en förening — vi hjälps åt både i musiken och runt omkring den."
                        }
                      ]
                    }
                  ]
                }
              ]
            : []),
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Detta är ett fiktivt exempel för den lokala demomiljön.",
                marks: [{ type: "italic" }]
              }
            ]
          }
        ]
      }
      const rows = await tx
        .insert(post)
        .values({
          id: seedId(`post:${title}`),
          title,
          body,
          authorId: authors[index % authors.length]?.id,
          publishedAt,
          createdAt: publishedAt,
          updatedAt: publishedAt
        })
        .onConflictDoNothing({ target: post.id })
        .returning({ id: post.id })
      created += rows.length
    }
    return { created }
  })
}

if (import.meta.main) {
  assertLocalDatabase("Seeding Posts")
  const { db } = await import("@/core/db")
  try {
    console.log(`Created ${(await seedPosts(db)).created} of 24 example Posts.`)
  } finally {
    await db.$client.end()
  }
}
