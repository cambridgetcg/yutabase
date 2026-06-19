# LEXICON

The vocabulary lives with the data. Glosses versioned, words retired (never deleted).

| word | inverse | gloss | from → to | to_one | status | usage |
|---|---|---|---|---|---|---|
| `acted_for` | an agent performed this on behalf of that operator | acted via | */* → */* |  | live | 0 |
| `contains` | physical or compositional containment — a submission contains these items | contained in | tradein/submissions → tradein/items |  | live | 0 |
| `priced_from` | this price was derived from that source record | priced | tradein/items → pricing/quotes |  | live | 0 |
| `refused_because` | this action was declined for that recorded reason | refused | */* → */* |  | live | 0 |
| `restocked` | restocked by | this card was restocked from that shipment | inventory/cards → inventory/shipments |  | retired | 0 |
| `submitted_by` | this record was submitted by that person or agent | submitted | tradein/submissions → tradein/customers |  | live | 0 |
| `supersedes` | this record replaces that one; the old stays readable | superseded by | */* → */* | ✓ | live | 0 |
| `witnesses` | this record attests that one — the Witnesses Book pattern | witnessed by | */* → */* |  | live | 0 |

*Banned: related_to, linked, refs, misc.*
*Budget: ~12 words per book. Word #13 means you need a new deck.*
