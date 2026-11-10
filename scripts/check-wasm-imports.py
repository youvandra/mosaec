#!/usr/bin/env python3
"""Fails when a Mosaec contract binary imports a promise action outside its allowlist.

The pack must never be able to add a key, deploy code or delete its account, and the registry
must never be able to give a pack a key or mutable code. Both properties are checked here on the
built wasm, so they hold whatever the source says.

Usage: check-wasm-imports.py <contract>=<path.wasm> [...]   (contract: pack | registry)
"""

import sys

ALLOWED_BATCH_ACTIONS = {
    "pack": set(),
    "registry": {
        "promise_batch_create",
        "promise_batch_action_create_account",
        "promise_batch_action_transfer",
        "promise_batch_action_use_global_contract",
        "promise_batch_action_function_call",
    },
}


def read_leb128(data: bytes, offset: int) -> tuple[int, int]:
    result = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        shift += 7
        if byte < 0x80:
            return result, offset


def read_name(data: bytes, offset: int) -> tuple[str, int]:
    length, offset = read_leb128(data, offset)
    return data[offset : offset + length].decode(), offset + length


def skip_import_desc(data: bytes, offset: int) -> int:
    kind = data[offset]
    offset += 1
    if kind == 0:  # function: type index
        _, offset = read_leb128(data, offset)
    elif kind == 1:  # table: reftype + limits
        offset += 1
        offset = skip_limits(data, offset)
    elif kind == 2:  # memory: limits
        offset = skip_limits(data, offset)
    elif kind == 3:  # global: valtype + mutability
        offset += 2
    else:
        raise ValueError(f"unknown import kind {kind}")
    return offset


def skip_limits(data: bytes, offset: int) -> int:
    flags = data[offset]
    offset += 1
    _, offset = read_leb128(data, offset)
    if flags & 1:
        _, offset = read_leb128(data, offset)
    return offset


def imports(path: str) -> list[str]:
    data = open(path, "rb").read()
    if data[:4] != b"\0asm":
        raise ValueError(f"{path} is not a wasm module")
    names = []
    offset = 8
    while offset < len(data):
        section_id = data[offset]
        size, offset = read_leb128(data, offset + 1)
        end = offset + size
        if section_id == 2:
            count, cursor = read_leb128(data, offset)
            for _ in range(count):
                _, cursor = read_name(data, cursor)
                name, cursor = read_name(data, cursor)
                cursor = skip_import_desc(data, cursor)
                names.append(name)
        offset = end
    return names


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__.strip().splitlines()[-1])
        return 2
    failed = False
    for arg in argv:
        contract, _, path = arg.partition("=")
        allowed = ALLOWED_BATCH_ACTIONS[contract]
        found = imports(path)
        batch = sorted(n for n in found if n.startswith("promise_batch"))
        forbidden = [n for n in batch if n not in allowed]
        print(f"{contract}: {len(found)} imports, batch actions: {', '.join(batch) or 'none'}")
        if forbidden:
            print(f"{contract}: forbidden imports: {', '.join(forbidden)}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
