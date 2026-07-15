"""SOC 2018 major-group names + a task→family helper.

Shared by the occupations hierarchy and the drift "by job family" grouping so
the SOC major-group map has ONE home — the family names a task rolls up to on
Rising Tide are the same names the occupation hierarchy uses.
"""

# SOC major group titles (derived from SOC 2018 structure).
MAJOR_GROUPS: dict[str, str] = {
    "11": "Management",
    "13": "Business and Financial Operations",
    "15": "Computer and Mathematical",
    "17": "Architecture and Engineering",
    "19": "Life, Physical, and Social Science",
    "21": "Community and Social Service",
    "23": "Legal",
    "25": "Educational Instruction and Library",
    "27": "Arts, Design, Entertainment, Sports, and Media",
    "29": "Healthcare Practitioners and Technical",
    "31": "Healthcare Support",
    "33": "Protective Service",
    "35": "Food Preparation and Serving Related",
    "37": "Building and Grounds Cleaning and Maintenance",
    "39": "Personal Care and Service",
    "41": "Sales and Related",
    "43": "Office and Administrative Support",
    "45": "Farming, Fishing, and Forestry",
    "47": "Construction and Extraction",
    "49": "Installation, Maintenance, and Repair",
    "51": "Production",
    "53": "Transportation and Material Moving",
}


def families_for_soc_codes(soc_codes: list[str] | None) -> list[str] | None:
    """Map SOC codes (6- or 8-digit, or bare 2-digit major-group codes) to their
    distinct major-group names, sorted for stable output.

    Returns None (not an empty list) when nothing maps, so an AEI task with no
    SOC linkage reads as "unassigned" downstream rather than an empty group.
    """
    if not soc_codes:
        return None
    names = sorted({MAJOR_GROUPS[c[:2]] for c in soc_codes if c[:2] in MAJOR_GROUPS})
    return names or None
