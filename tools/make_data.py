#!/usr/bin/env python3
"""Writes src/data.js and the downloadable sample workbook from one set of synthetic rows.

Every account, quantity, invoice and file below is FICTIONAL. Only the catalog entries
(line, strain, format) come from rovebrand.com, read on 2026-11-05.
Run: python3 tools/make_data.py
"""
import json, os
from openpyxl import Workbook

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

AG5 = "ROVE ICE PACK ACAPULCO GOLD 2.5G 5PK"
AG5b = "Rove Ice Packs Acapulco Gold 2.5g (5)"
AG5c = "IP ACAP GLD 5PK"
AGB = "ROVE IP BLUNT ACAPULCO GOLD 2G"
AGBb = "Ice Packs Blunts Acapulco Gold 2g"
AF5 = "ROVE ICE PACK APPLE FRITTER 2.5G 5PK"
MI_HEAD = ["Inv #", "Inv Date", "Acct", "Item", "Partner SKU", "Qty", "UOM"]
CR_HEAD = ["Credit #", "Date", "Acct", "Item", "Qty", "UOM", "Ref Inv"]
OH_HEAD = ["Invoice No", "Date", "Customer", "Description", "Qty Shipped", "Unit"]
OH5 = "Ice Packs 5pk - Acapulco Gold 2.5g"


def mi_sheet(period, rows):
    return [["Michigan partner, weekly sales (fictional sample)"], [f"Period covered: {period}"], [], MI_HEAD] + rows


FILES = {
    "mi-w43": {
        "name": "MI_partner_weekly_2026-10-25.xlsx", "market": "MI", "kind": "sell-in", "source": "mi-partner",
        "sheets": {"Invoices": mi_sheet("10/19/2026 - 10/25/2026", [
            ["INV-50301", "10/19/2026", "MI-003", AG5, "RV-IP-AG-5", "90", "BX"],
            ["INV-50302", "10/19/2026", "MI-014", AG5c, "", "130", "BOX"],
            ["INV-50305", "10/20/2026", "MI-007", AG5b, "", "80", "Box"],
            ["INV-50306", "10/20/2026", "MI-003", AGB, "RV-IPB-AG-2", "28", "EA"],
            ["INV-50308", "10/20/2026", "MI-007", AF5, "RV-IP-AF-5", "35", "BX"],
            ["INV-50310", "10/21/2026", "MI-011", AG5, "RV-IP-AG-5", "95", "BX"],
            ["INV-50312", "10/21/2026", "MI-022", AG5c, "", "75", "BX"],
            ["INV-50318", "10/22/2026", "MI-031", AG5b, "", "135", "Box"],
            ["INV-50322", "10/23/2026", "MI-003", AG5, "RV-IP-AG-5", "95", "BX"],
            ["INV-50325", "10/23/2026", "MI-022", AG5, "RV-IP-AG-5", "100", "BX"],
            ["INV-50327", "10/23/2026", "MI-022", AF5, "RV-IP-AF-5", "30", "BX"],
            ["INV-50330", "10/24/2026", "MI-007", AG5c, "", "80", "BX"],
            ["INV-50335", "10/25/2026", "MI-014", AG5, "RV-IP-AG-5", "120", "BX"],
        ])},
    },
    "mi-w44a": {
        "name": "MI_partner_weekly_2026-10-29.xlsx", "market": "MI", "kind": "sell-in", "source": "mi-partner",
        "sheets": {"Invoices": mi_sheet("10/26/2026 - 10/29/2026", [
            ["INV-50371", "10/26/2026", "MI-003", AG5, "RV-IP-AG-5", "60", "BX"],
            ["INV-50372", "10/26/2026", "MI-011", AG5b, "", "30", "Box"],
            ["INV-50373", "10/26/2026", "MI-014", AG5c, "RV-IP-AG-5", "60.00", "BOX"],
            ["INV-50374", "10/26/2026", "MI-031", AG5, "RV-IP-AG-5", "10", "BX"],
            ["INV-50375", "10/26/2026", "MI-007", AF5, "RV-IP-AF-5", "40", "BX"],
            ["INV-50381", "10/27/2026", "MI-007", AG5c, "", "50", "BX"],
            ["INV-50382", "10/27/2026", "MI-014", AG5, "RV-IP-AG-5", " 50 ", "BX"],
            ["INV-50383", "10/27/2026", "MI-022", AG5b, "", "40", "Box"],
            ["INV-50384", "10/27/2026", "MI-003", AGB, "RV-IPB-AG-2", "30", "EA"],
            ["INV-50389", "10/28/2026", "MI-003", AG5, "RV-IP-AG-5", "60", "BX"],
            ["INV-50390", "10/28/2026", "MI-022", AG5c, "", "60", "BX"],
            ["INV-50391", "10/28/2026", "MI-031", AG5, "RV-IP-AG-5", "30", "BX"],
            ["INV-50392", "10/28/2026", "MI-014", AGBb, "", "24", "EA"],
            ["INV-50396", "10/29/2026", "MI-007", AG5, "RV-IP-AG-5", "40", "BX"],
            ["INV-50397", "10/29/2026", "MI-011", AG5c, "", "30", "BX"],
            ["INV-50398", "10/29/2026", "MI-014", AG5, "RV-IP-AG-5", "40", "BX"],
            ["INV-50399", "10/29/2026", "MI-031", AG5b, "", "40", "Box"],
            ["INV-50400", "10/29/2026", "MI-022", AF5, "RV-IP-AF-5", "30", "BX"],
        ])},
    },
    "mi-w44b": {
        "name": "MI_partner_weekly_2026-11-01.xlsx", "market": "MI", "kind": "sell-in", "source": "mi-partner",
        "sheets": {
            "Invoices": mi_sheet("10/30/2026 - 11/01/2026", [
                ["INV-50398", "10/29/2026", "MI-014", AG5, "RV-IP-AG-5", "40", "BX"],
                ["INV-50403", "10/30/2026", "MI-003", AG5, "RV-IP-AG-5", "40", "BX"],
                ["INV-50404", "10/30/2026", "MI-014", AG5c, "", "72", "BOX"],
                ["INV-50405", "10/30/2026", "MI-007", AG5b, "", "60", "Box"],
                ["INV-50406", "10/30/2026", "MI-014", AGB, "RV-IPB-AG-2", "20", "EA"],
                ["INV-50407", "10/30/2026", "MI-007", "DISPLAY KIT, COUNTER", "", "1", "EA"],
                ["INV-50411", "10/31/2026", "MI-003", AG5c, "", "30", "BX"],
                ["INV-50412", "10/31/2026", "MI-011", AG5, "RV-IP-AG-5", "40", "BX"],
                ["INV-50413", "10/31/2026", "MI-022", AG5, "RV-IP-AG-5", "40", "BX"],
                ["INV-50414", "10/31/2026", "MI-031", AG5b, "", "30", "Box"],
                ["INV-50415", "10/31/2026", "MI-031", AF5, "RV-IP-AF-5", "25", "BX"],
                ["INV-50416", "10/31/2026", "MI-022", AG5c, "", "", "BX"],
                ["INV-50419", "11/01/2026", "MI-014", AG5, "RV-IP-AG-5", "60", "BX"],
                ["INV-50420", "11/01/2026", "MI-022", AG5c, "", "30", "BX"],
                ["INV-50421", "11/01/2026", "MI-031", AG5, "RV-IP-AG-5", "30", "BX"],
            ]),
            "Credits": [["Credit memos (fictional sample)"], CR_HEAD,
                        ["CR-1182", "10/31/2026", "MI-014", AG5, "12", "BX", "INV-50404"]],
        },
    },
    "mi-pos-022": {
        "name": "MI-022_pos_export_2026-11-01.csv", "market": "MI", "kind": "sell-through", "source": "mi-pos-022",
        "account": "MI-022", "timezone": "America/Detroit",
        "sheets": {"Export": [
            ["Export range: 2026-10-26 to 2026-11-01"],
            ["Txn ID", "Local Time", "Item", "Qty", "Customer Phone", "Loyalty #"],
            ["T-88101", "2026-10-26 11:12 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "2", "(555) 010-0142", "L-20931"],
            ["T-88114", "2026-10-26 17:40 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "3", "(555) 010-0177", "L-20460"],
            ["T-88122", "2026-10-27 13:05 -04:00", "Rove Ice Packs Blunt Acapulco Gold 2g", "2", "", ""],
            ["T-88131", "2026-10-28 15:22 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "4", "(555) 010-0108", "L-21107"],
            ["T-88140", "2026-10-29 12:48 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "5", "", "L-20022"],
            ["T-88152", "2026-10-30 16:30 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "6", "(555) 010-0163", ""],
            ["T-88160", "2026-10-30 18:05 -04:00", "ACAPULCO GOLD", "2", "", ""],
            ["T-88168", "2026-10-31 14:10 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "7", "(555) 010-0191", "L-21950"],
            ["T-88168", "2026-10-31 14:10 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "7", "(555) 010-0191", "L-21950"],
            ["T-88175", "2026-10-31 20:55 -04:00", "Rove Ice Packs Blunt Acapulco Gold 2g", "3", "", ""],
            ["T-88190", "2026-11-01 01:30 -04:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "3", "(555) 010-0120", "L-20333"],
            ["T-88191", "2026-11-01 01:30 -05:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "3", "", "L-21012"],
            ["T-88195", "2026-11-01 23:40 -05:00", "Rove Ice Pack Acapulco Gold 2.5g 5pk", "8", "(555) 010-0155", ""],
        ]},
    },
    "mi-panel": {
        "name": "MI_market_panel_2026-10-25.csv", "market": "MI", "kind": "panel", "source": "mi-panel",
        "sheets": {"Extract": [
            ["Market panel extract (fictional sample). Market level estimate, projected from a sample of retailers."],
            ["Period: 2026-10-19 to 2026-10-25"],
            ["Market", "Segment", "Brand est. units"],
            ["Michigan", "Infused pre-roll five-packs", "3900"],
        ]},
    },
    "oh-w43": {
        "name": "OH_partner_sales_wk43.xlsx", "market": "OH", "kind": "sell-in", "source": "oh-partner",
        "sheets": {"Sales": [["Ohio partner sales (fictional sample)"], ["Coverage 10/19/2026 to 10/25/2026"], OH_HEAD,
            ["7101", "10/20/2026", "OH-002", OH5, "120", "Boxes"],
            ["7103", "10/20/2026", "OH-005", OH5, "140", "Boxes"],
            ["7106", "10/21/2026", "OH-009", OH5, "180", "Boxes"],
            ["7109", "10/23/2026", "OH-002", OH5, "130", "Boxes"],
            ["7112", "10/24/2026", "OH-005", OH5, "145", "Boxes"],
        ]},
    },
    "oh-w44": {
        "name": "OH_partner_sales_wk44.xlsx", "market": "OH", "kind": "sell-in", "source": "oh-partner",
        "sheets": {"Sales": [["Ohio partner sales (fictional sample)"], ["Coverage 10/26/2026 to 11/01/2026"], OH_HEAD,
            ["7121", "10/27/2026", "OH-002", OH5, "130", "Boxes"],
            ["7123", "10/27/2026", "OH-005", OH5, "150", "Boxes"],
            ["7126", "10/28/2026", "OH-009", OH5, "90", "Boxes"],
            ["7130", "10/30/2026", "OH-002", OH5, "130", "Boxes"],
            ["7133", "10/31/2026", "OH-005", OH5, "150", "Boxes"],
            ["7136", "11/01/2026", "OH-009", OH5, "90", "Boxes"],
        ]},
    },
}

# Prepared offline in this build session for this sample (no API call at run time).
# The text only picks claim kinds and fact ids; code writes every number, name and date.
ANSWERS = [
    {"id": "why-pending", "market": "MI", "when": "pending", "question": "Why is the weekly change pending?",
     "claims": [{"kind": "coverage_partial", "fact": "MI.coverage"}, {"kind": "counted_so_far", "fact": "MI.total"}],
     "notes": ["A change computed today would set a partial week against a full week, so the page holds it back.",
               "The days count as missing because no partner file declares them, not because sales stopped."]},
    {"id": "why-ready", "market": "MI", "when": "ready", "question": "Why is the weekly figure ready now?",
     "claims": [{"kind": "coverage_complete", "fact": "MI.coverage"}, {"kind": "week_total", "fact": "MI.total"},
                {"kind": "credit_applied", "fact": "MI.credit.CR-1182"},
                {"kind": "duplicate_skipped", "fact": "MI.dup.INV-50398"},
                {"kind": "held_outside_figure", "fact": "MI.held.T-88160"}],
     "notes": ["Nothing was guessed: a line without a clear format waits for a person."]},
    {"id": "ohio-close", "market": "OH", "when": "ready", "question": "How did Ohio close the week?",
     "claims": [{"kind": "coverage_complete", "fact": "OH.coverage"}, {"kind": "week_total", "fact": "OH.total"}],
     "notes": ["This partner file arrived complete, so the figure was ready for the review."]},
]

js = ("// Generated by tools/make_data.py. All accounts, quantities, invoices and files are fictional.\n"
      "// Catalog entries come from rovebrand.com (home page and /pages/ice-packs-blunt), read 2026-11-05.\n"
      f"export const FILES = {json.dumps(FILES, indent=1)};\n"
      f"export const ANSWERS = {json.dumps(ANSWERS, indent=1)};\n")
open(os.path.join(ROOT, "src", "data.js"), "w").write(js)

f = FILES["mi-w44b"]; wb = Workbook(); wb.remove(wb.active)
for tab, rows in f["sheets"].items():
    ws = wb.create_sheet(tab)
    for r in rows:
        ws.append(r if r else [None])
wb.save(os.path.join(ROOT, "site", "files", f["name"]))
print("ok")
