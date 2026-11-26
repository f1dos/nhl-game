import type { NhlRosterIdentity } from "./nhl-2026-27";

// Barzal is on injured reserve and was absent from the roster feed.
export const barzal: NhlRosterIdentity = {
  id: 8478445,
  firstName: "Mathew",
  lastName: "Barzal",

  number: 13,
  position: "C",
  age: 29,
  nation: "CAN",
  birthDate: "1997-05-26",

  headshot: "https://assets.nhle.com/mugs/nhl/20262027/NYI/8478445.png",
};

/** Opening 2026/27 database adjustments keyed by NHL identity. */
export const openingRatings: Record<
  number,
  { overall?: number; potential?: [number, number]; revision2?: "overall" | "potential" | "both" }
> = {
  8478048: { overall: 89 }, // Igor Shesterkin
  8478009: { overall: 89 }, // Ilya Sorokin
  8484170: { overall: 83, potential: [87, 93], revision2: "potential" }, // Jacob Fowler
  8481540: { overall: 89, potential: [90, 92] }, // Cole Caufield
  8471675: { overall: 86 }, // Sidney Crosby
  8471215: { overall: 83 }, // Evgeni Malkin
  8477986: { overall: 85 }, // Brandon Montour
  8475831: { overall: 75 }, // Philipp Grubauer
  8480843: { overall: 70, potential: [72, 74] }, // Lukas Dostal
  8486103: { potential: [83, 89] }, // Ivar Stenberg
  8482137: { overall: 70, potential: [75, 78] }, // Yaroslav Askarov
  8476883: { overall: 89 }, // Andrei Vasilevskiy
  8479318: { overall: 90 }, // Auston Matthews
  8480893: { overall: 86, potential: [87, 88] }, // Kirill Marchenko
  8475683: { overall: 75 }, // Sergei Bobrovsky
  8476932: { overall: 75 }, // Anthony Stolarz
  8478872: { overall: 73 }, // Karel Vejmelka
  8478498: { overall: 78 }, // Jake DeBrusk
  8477507: { overall: 78 }, // Nikita Zadorov
  8482511: { potential: [77, 79] }, // Mason Lohrei
  8478483: { overall: 89 }, // Mitch Marner
  8478499: { overall: 74, revision2: "overall" }, // Adin Hill
  8476460: { overall: 88 }, // Mark Scheifele
  8480014: { overall: 81 }, // Gabriel Vilardi
  8476480: { overall: 69 }, // Vladislav Namestnikov
  8482076: { overall: 65, potential: [69, 74] }, // Nico Daws
  8479345: { overall: 86 }, // Jakob Chychrun
  8477949: { overall: 87 }, // Alex Tuch
  8480313: { overall: 80 }, // Logan Thompson
  8480873: { overall: 78 }, // Rasmus Sandin
  8481030: { overall: 65, revision2: "overall" }, // Jack St. Ivany
  8480796: { overall: 75 }, // Martin Fehérváry
  8479292: { overall: 67 }, // Charlie Lindgren
  8480045: { overall: 75, potential: [76, 77] }, // Ukko-Pekka Luukkonen
  8476891: { overall: 68 }, // Matt Grzelcyk
  8482896: { overall: 65, potential: [67, 71] }, // Tyson Kozak
  8483548: { overall: 80 }, // Brandon Bussi
  8480829: { overall: 67 }, // Jesperi Kotkaniemi
  8478970: { overall: 77 }, // Jalen Chatfield
  8482100: { overall: 80, potential: [82, 86] }, // Alexander Nikishin
  8480817: { overall: 82, potential: [83, 84] }, // K'Andre Miller
  8477497: { overall: 75 }, // Sean Monahan
  8482705: { overall: 73, potential: [75, 78] }, // Cole Sillinger
  8475660: { overall: 65 }, // Cam Talbot
  8481692: { overall: 68, potential: [69, 73] }, // Dustin Wolf
  8476456: { overall: 75 }, // Jonathan Huberdeau
  8484390: { overall: 78, potential: [82, 86] }, // Roman Kantserov
  8484783: { overall: 75, potential: [81, 86] }, // Artyom Levshunov
  8470613: { overall: 70 }, // Brent Burns
  8479979: { overall: 85, potential: [86, 87] }, // Jake Oettinger
  8480027: { potential: [90, 92] }, // Jason Robertson
  8481542: { potential: [86, 87] }, // Moritz Seider
  8477934: { overall: 95 }, // Leon Draisaitl
  8482221: { overall: 70, potential: [74, 78] }, // Devon Levi
  8477953: { overall: 71 }, // Kasperi Kapanen
  8481617: { overall: 79, potential: [80, 82] }, // Vasily Podkolzin
  8477935: { overall: 80 }, // Sam Bennett
  8477932: { overall: 79 }, // Aaron Ekblad
  8477493: { overall: 89 }, // Aleksander Barkov
  8475179: { overall: 78, revision2: "overall" }, // Dmitry Kulikov
  8474593: { overall: 78 }, // Jacob Markstrom
  8478859: { overall: 71 }, // Niko Mikkola
  8475311: { overall: 67, revision2: "overall" }, // Darcy Kuemper
  8481532: { overall: 65, potential: [67, 70] }, // Alex Turcotte
  8470621: { overall: 70 }, // Corey Perry
  8478550: { overall: 89 }, // Artemi Panarin
  8478864: { overall: 94 }, // Kirill Kaprizov
  8480800: { overall: 93 }, // Quinn Hughes
  8482661: { overall: 88, potential: [89, 92], revision2: "both" }, // Jesper Wallstedt
  8481557: { potential: [89, 91], revision2: "potential" }, // Matt Boldy
  8485702: { overall: 76, potential: [79, 81] }, // Maxim Shabanov
  8481553: { overall: 73, potential: [75, 78] }, // Bobby Brink
  8483525: { overall: 72, potential: [76, 80] }, // Danila Yurov
  8481523: { overall: 70, potential: [73, 76] }, // Kirby Dach
  8481559: { potential: [93, 94] }, // Jack Hughes
  8481721: { potential: [81, 84] }, // Arseny Gritsyuk
  8482146: { potential: [80, 83] }, // Luke Evangelista
  8484987: { overall: 63, potential: [73, 79] }, // Anton Silaev
  8479996: { overall: 70, potential: [71, 72] }, // Cody Glass
  8480002: { potential: [82, 84], revision2: "potential" }, // Nico Hischier
  8477424: { overall: 81 }, // Juuse Saros
  8476539: { overall: 75 }, // Jonathan Marchessault
  8485366: { potential: [92, 94] }, // Matthew Schaefer
  8485388: { potential: [80, 86] }, // Victor Eklund
  8478445: { overall: 83 }, // Mathew Barzal
  8481014: { overall: 73, potential: [75, 77] }, // Alexander Romanov
  8476292: { overall: 70 }, // Ondrej Palat
  8482193: { overall: 75, potential: [83, 87] }, // Dylan Garand
  8481604: { overall: 80, potential: [82, 84] }, // Pavel Dorofeyev
  8482157: { overall: 75, potential: [76, 79] }, // Will Cuylle
  8482073: { overall: 75, potential: [76, 78] }, // Braden Schneider
  8483669: { potential: [69, 73] }, // Adam Sykora
  8482877: { overall: 66, potential: [69, 73] }, // Jaroslav Chmelar
  8481525: { overall: 61, potential: [62, 64] }, // Matthew Robertson
  8481528: { potential: [80, 82] }, // Dylan Cozens
  8477444: { overall: 69 }, // Andre Burakovsky
  8484148: { potential: [79, 84] }, // Oliver Bonk
  8485406: { potential: [79, 85] }, // Porter Martone
  8482159: { overall: 73, potential: [74, 76] }, // Tyson Foerster
  8478435: { overall: 71, revision2: "overall" }, // Dan Vladar
  8479361: { overall: 70, revision2: "overall" }, // Joseph Woll
  8481546: { overall: 72, potential: [74, 76] }, // Cam York
  8481668: { overall: 65, potential: [67, 71] }, // Arturs Silovs
  8483703: { overall: 61, potential: [71, 75] }, // Sergei Murashov
  8477498: { overall: 77 }, // Darnell Nurse
  8476412: { overall: 69 }, // Jordan Binnington
  8480981: { overall: 84, potential: [85, 87] }, // Joel Hofer
  8477402: { overall: 77 }, // Pavel Buchnevich
  8483710: { overall: 67, potential: [72, 77], revision2: "overall" }, // Dennis Hildeby
  8482655: { overall: 75, potential: [76, 77] }, // J.J. Moser
  8478416: { overall: 75 }, // Erik Cernak
  8475167: { overall: 79 }, // Victor Hedman
  8480426: { overall: 77 }, // Charle-Edouard D'Astous
  8475690: { overall: 69 }, // Chris Tanev
  8480022: { overall: 66, potential: [68, 70], revision2: "both" }, // Michael DiPietro
  8485395: { overall: 76, potential: [84, 89], revision2: "both" }, // James Hagens
  8479371: { overall: 73, revision2: "overall" }, // Dante Fabbro
  8478856: { overall: 73, revision2: "overall" }, // Conor Garland
  8483485: { overall: 76, potential: [81, 85], revision2: "both" }, // Denton Mateychuk
  8478500: { overall: 78, revision2: "overall" }, // Ivan Provorov
  8475790: { overall: 63, revision2: "overall" }, // Erik Gudbranson
  8483482: { overall: 75, potential: [79, 84], revision2: "both" }, // Tristan Luneau
  8483490: { overall: 76, potential: [79, 83], revision2: "both" }, // Pavel Mintyukov
  8484471: { potential: [81, 87], revision2: "potential" }, // Emmitt Finnie
  8478854: { overall: 75, revision2: "overall" }, // Ryan Shea
  8473419: { overall: 79, revision2: "overall" }, // Brad Marchand
  8476341: { overall: 71, revision2: "overall" }, // Anton Forsberg
  8474600: { overall: 88, revision2: "overall" }, // Roman Josi
  8483524: { potential: [79, 84], revision2: "potential" }, // Shane Wright
  8476461: { overall: 72, revision2: "overall" }, // Sean Couturier
  8479324: { overall: 74, revision2: "overall" }, // Ryan Lindgren
  8477404: { overall: 89, revision2: "overall" }, // Jake Guentzel
  8479542: { overall: 89, revision2: "overall" }, // Brandon Hagel
  8482657: { overall: 65, revision2: "overall" }, // Sebastian Cossa
  8474568: { overall: 63, revision2: "overall" }, // Luke Schenn
  8480078: { overall: 67, revision2: "overall" }, // Filip Chytil
  8478468: { overall: 67, revision2: "overall" }, // Jeremy Lauzon
  8475718: { overall: 63, revision2: "overall" }, // Justin Holl
  8478463: { overall: 68, revision2: "overall" }, // Anthony Beauvillier
};
