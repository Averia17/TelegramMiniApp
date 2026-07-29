"""
Batch-audit and standardize GLB heroes for a game engine.

Run with Blender, not regular Python:

    blender --background --python tools/blender/batch_standardize_heroes.py -- --dry-run
    blender --background --python tools/blender/batch_standardize_heroes.py -- --apply

The default mode is dry-run. Source GLB files are never overwritten.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import traceback
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Optional

import bpy
from mathutils import Matrix, Vector

DEFAULT_INPUT = Path(
    r"C:\Users\User\PycharmProjects\TelegramMiniApp" r"\frontend\public\assets\heroes"
)
HAND_ALIASES = (
    "Hand_R",
    "RightHand",
    "wrist_r",
    "Hand.R",
    "mixamorig:RightHand",
    "R_Wrist",
    "R_wrist_s",
)
WEAPON_KEYWORDS = (
    "weapon",
    "sword",
    "gun",
    "axe",
    "blade",
    "rifle",
    "pistol",
    "bow",
    "staff",
    "spear",
    "hammer",
    "katana",
)
BODY_HINTS = ("body", "character", "skin", "hero", "mesh")
SOCKET_NAME = "weapon_socket_r"


@dataclass
class HeroResult:
    hero: str
    source: str
    mode: str
    status: str = "ПРОПУЩЕН/ОШИБКА"
    armature: Optional[str] = None
    hand_bone: Optional[str] = None
    socket_state: str = "not_checked"
    weapon_state: str = "not_checked"
    weapon_objects: list[str] = field(default_factory=list)
    merged_candidates: list[dict] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    diagnostic_bones: list[str] = field(default_factory=list)
    scene_objects: list[dict] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)


def log(message: str) -> None:
    print(message, flush=True)


def normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def has_keyword(value: str, keywords: Iterable[str] = WEAPON_KEYWORDS) -> bool:
    lowered = value.casefold()
    return any(keyword in lowered for keyword in keywords)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify-only", action="store_true")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-heroes", type=Path)
    parser.add_argument("--output-weapons", type=Path)
    parser.add_argument("--report", type=Path)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    args.dry_run = not args.apply and not args.verify_only
    args.input = args.input.resolve()
    args.output_heroes = (
        args.output_heroes.resolve()
        if args.output_heroes
        else args.input / "output_heroes"
    )
    args.output_weapons = (
        args.output_weapons.resolve()
        if args.output_weapons
        else args.input / "output_weapons"
    )
    args.report = (
        args.report.resolve()
        if args.report
        else args.input / "hero_standardization_report.json"
    )
    return args


def reset_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def import_glb(path: Path) -> None:
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB import failed: {result}")


def find_armature(result: HeroResult) -> Optional[bpy.types.Object]:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        synthesized = synthesize_armature_from_empty_rig(result)
        if synthesized is not None:
            return synthesized
        result.errors.append("Armature не найден")
        return None
    if len(armatures) > 1:
        weighted = []
        for armature in armatures:
            linked = sum(
                1
                for obj in bpy.context.scene.objects
                if obj.type == "MESH"
                and any(
                    modifier.type == "ARMATURE" and modifier.object == armature
                    for modifier in obj.modifiers
                )
            )
            weighted.append((linked, len(armature.data.bones), armature))
        weighted.sort(key=lambda item: (item[0], item[1]), reverse=True)
        result.warnings.append(
            f"Найдено Armature: {len(armatures)}; выбран {weighted[0][2].name}"
        )
        return weighted[0][2]
    return armatures[0]


def synthesize_armature_from_empty_rig(
    result: HeroResult,
) -> Optional[bpy.types.Object]:
    rig_roots = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "EMPTY" and "rig" in obj.name.casefold()
    ]
    if not rig_roots:
        return None
    rig_root = max(
        rig_roots,
        key=lambda root: sum(
            1 for child in root.children_recursive if child.type == "EMPTY"
        ),
    )
    empties = [obj for obj in rig_root.children_recursive if obj.type == "EMPTY"]
    if len(empties) < 3:
        return None
    armature_data = bpy.data.armatures.new(f"{result.hero}_Armature")
    armature = bpy.data.objects.new(f"{result.hero}_Armature", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.matrix_world = Matrix.Identity(4)
    armature["legacy_synthesized"] = True
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        by_empty = {}
        for empty in empties:
            bone = armature_data.edit_bones.new(empty.name)
            head = empty.matrix_world.translation
            child_empties = [child for child in empty.children if child in empties]
            if child_empties:
                target = child_empties[0].matrix_world.translation
                direction = target - head
            elif empty.parent in empties:
                direction = head - empty.parent.matrix_world.translation
            else:
                direction = Vector((0.0, 0.05, 0.0))
            if direction.length < 0.001:
                direction = Vector((0.0, 0.05, 0.0))
            bone.head = head
            bone.tail = head + direction.normalized() * max(
                direction.length * 0.35, 0.01
            )
            bone.use_deform = False
            by_empty[empty] = bone
        for empty, bone in by_empty.items():
            if empty.parent in by_empty:
                bone.parent = by_empty[empty.parent]
                bone.use_connect = False
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    result.warnings.append(
        f"Legacy Empty-скелет {rig_root.name} преобразован во временный Armature; "
        "исходная иерархия сохранена"
    )
    result.changes.append("синтезирован Armature из legacy Empty-скелета")
    return armature


def find_right_hand(armature: bpy.types.Object) -> Optional[bpy.types.Bone]:
    exact = {alias.casefold() for alias in HAND_ALIASES}
    normalized = {normalized_name(alias) for alias in HAND_ALIASES}
    for bone in armature.data.bones:
        if bone.name.casefold() in exact:
            return bone
    for bone in armature.data.bones:
        if normalized_name(bone.name) in normalized:
            return bone
    # Conservative last resort for common namespaced rigs.
    candidates = [
        bone
        for bone in armature.data.bones
        if ("hand" in bone.name.casefold() or "wrist" in bone.name.casefold())
        and any(
            token in normalized_name(bone.name)
            for token in ("right", "handr", "wristr")
        )
    ]
    if len(candidates) == 1:
        return candidates[0]
    # Common exporter conventions: R_Hand, R-Hand, handRight, DEF-hand.R.
    side_candidates = []
    for bone in armature.data.bones:
        raw = bone.name.casefold()
        norm = normalized_name(bone.name)
        is_hand = "hand" in raw or "wrist" in raw
        is_right = (
            re.search(r"(^|[._:\-\s])r($|[._:\-\s])", raw) is not None
            or norm.startswith(("rhand", "rwrist"))
            or norm.endswith(("handr", "wristr", "right"))
            or "right" in norm
        )
        if is_hand and is_right:
            side_candidates.append(bone)
    return side_candidates[0] if len(side_candidates) == 1 else None


def scene_diagnostics() -> list[dict]:
    diagnostics = []
    for obj in bpy.context.scene.objects:
        item = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
        }
        if obj.type == "MESH":
            item["vertices"] = len(obj.data.vertices)
            item["polygons"] = len(obj.data.polygons)
            item["armatures"] = [
                modifier.object.name if modifier.object else None
                for modifier in armature_modifiers(obj)
            ]
        elif obj.type == "ARMATURE":
            item["bones"] = len(obj.data.bones)
        diagnostics.append(item)
    return diagnostics


def hand_center_local(hand: bpy.types.Bone) -> Vector:
    return hand.head_local.lerp(hand.tail_local, 0.5)


def audit_socket(
    armature: bpy.types.Object,
    hand: bpy.types.Bone,
    result: HeroResult,
) -> bool:
    socket = armature.data.bones.get(SOCKET_NAME)
    if socket is None:
        result.socket_state = "missing"
        return False
    issues = []
    if socket.parent != hand:
        issues.append("wrong_parent")
    if socket.use_deform:
        issues.append("deform_enabled")
    result.socket_state = "valid" if not issues else "invalid:" + ",".join(issues)
    return not issues


def repair_socket(
    armature: bpy.types.Object,
    hand_name: str,
    result: HeroResult,
) -> None:
    previous_active = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bones = armature.data.edit_bones
        hand = bones.get(hand_name)
        if hand is None:
            raise RuntimeError(f"Кость кисти исчезла в Edit Mode: {hand_name}")
        socket = bones.get(SOCKET_NAME)
        created = socket is None
        if created:
            socket = bones.new(SOCKET_NAME)
        center = hand.head.lerp(hand.tail, 0.5)
        hand_length = max((hand.tail - hand.head).length, 0.01)
        direction = (hand.tail - hand.head).normalized()
        if direction.length < 0.5:
            direction = Vector((0.0, 0.05, 0.0))
        socket.head = center
        socket.tail = center + direction * max(hand_length * 0.2, 0.005)
        socket.parent = hand
        socket.use_connect = False
        socket.use_deform = False
        result.changes.append(
            "создан weapon_socket_r" if created else "исправлен weapon_socket_r"
        )
        result.socket_state = "created" if created else "repaired"
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
        if previous_active and previous_active.name in bpy.context.scene.objects:
            bpy.context.view_layer.objects.active = previous_active


def armature_modifiers(obj: bpy.types.Object) -> list[bpy.types.Modifier]:
    return [modifier for modifier in obj.modifiers if modifier.type == "ARMATURE"]


def mesh_is_rigged_to(obj: bpy.types.Object, armature: bpy.types.Object) -> bool:
    if obj.parent == armature:
        return True
    return any(modifier.object == armature for modifier in armature_modifiers(obj))


def find_existing_weapons(
    armature: bpy.types.Object,
    result: HeroResult,
) -> list[bpy.types.Object]:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    named = [
        obj for obj in meshes if has_keyword(obj.name) or has_keyword(obj.data.name)
    ]
    material_named = [
        obj
        for obj in meshes
        if any(
            slot.material and has_keyword(slot.material.name)
            for slot in obj.material_slots
        )
    ]
    candidates = list(dict.fromkeys(named + material_named))
    # Include multipart weapon descendants only when an ancestor explicitly identifies
    # the semantic attachment. Generic unrigged pieces (Icosphere, Cone, etc.) are
    # common character decorations and must never be treated as weapons by default.
    for obj in meshes:
        ancestor = obj.parent
        while ancestor is not None:
            if has_keyword(ancestor.name):
                candidates.append(obj)
                break
            ancestor = ancestor.parent
    candidates = list(dict.fromkeys(candidates))
    result.weapon_objects = [obj.name for obj in candidates]
    return candidates


def connected_face_components(mesh: bpy.types.Mesh) -> list[set[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = {}
    for polygon in mesh.polygons:
        for key in polygon.edge_keys:
            edge_faces.setdefault(tuple(sorted(key)), []).append(polygon.index)
    adjacency: dict[int, set[int]] = {polygon.index: set() for polygon in mesh.polygons}
    for face_indices in edge_faces.values():
        for index in face_indices:
            adjacency[index].update(other for other in face_indices if other != index)
    unseen = set(adjacency)
    components = []
    while unseen:
        seed = unseen.pop()
        component = {seed}
        stack = [seed]
        while stack:
            current = stack.pop()
            neighbors = adjacency[current] & unseen
            unseen.difference_update(neighbors)
            component.update(neighbors)
            stack.extend(neighbors)
        components.append(component)
    return components


def component_stats(
    obj: bpy.types.Object,
    face_indices: set[int],
    armature: bpy.types.Object,
    hand: bpy.types.Bone,
) -> dict:
    mesh = obj.data
    vertex_indices = {
        vertex_index
        for face_index in face_indices
        for vertex_index in mesh.polygons[face_index].vertices
    }
    points = [obj.matrix_world @ mesh.vertices[index].co for index in vertex_indices]
    center = sum(points, Vector()) / max(len(points), 1)
    hand_world = armature.matrix_world @ hand_center_local(hand)
    material_names = {
        mesh.materials[mesh.polygons[index].material_index].name
        for index in face_indices
        if mesh.materials
        and mesh.polygons[index].material_index < len(mesh.materials)
        and mesh.materials[mesh.polygons[index].material_index]
    }
    keyword = any(has_keyword(name) for name in material_names)
    group_names = {
        obj.vertex_groups[group.group].name
        for vertex_index in vertex_indices
        for group in mesh.vertices[vertex_index].groups
        if group.group < len(obj.vertex_groups)
    }
    hand_weighted = any(
        normalized_name(name) == normalized_name(hand.name) for name in group_names
    )
    return {
        "object": obj.name,
        "faces": len(face_indices),
        "vertices": len(vertex_indices),
        "fraction": len(face_indices) / max(len(mesh.polygons), 1),
        "distance_to_hand": (center - hand_world).length,
        "keyword_material": keyword,
        "hand_weighted": hand_weighted,
        "materials": sorted(material_names),
        "_faces": face_indices,
    }


def find_merged_candidates(
    armature: bpy.types.Object,
    hand: bpy.types.Bone,
    excluded: set[bpy.types.Object],
    result: HeroResult,
) -> list[tuple[bpy.types.Object, set[int], dict]]:
    candidates = []
    for obj in bpy.context.scene.objects:
        if (
            obj.type != "MESH"
            or obj in excluded
            or not mesh_is_rigged_to(obj, armature)
        ):
            continue
        components = connected_face_components(obj.data)
        if len(components) < 2:
            continue
        stats = [
            component_stats(obj, component, armature, hand) for component in components
        ]
        largest = max(item["faces"] for item in stats)
        for component, item in zip(components, stats):
            plausible_size = item["faces"] < largest and item["fraction"] < 0.35
            strong_signal = item["keyword_material"]
            # Hand-weighted disconnected islands are frequently fingers, cuffs, or
            # armor plates. Without a semantic material signal they are reported as
            # ordinary body geometry, not destructively separated as a weapon.
            if plausible_size and strong_signal:
                public_item = {
                    key: value for key, value in item.items() if not key.startswith("_")
                }
                result.merged_candidates.append(public_item)
                candidates.append((obj, component, item))
    return candidates


def copy_component_to_object(
    source: bpy.types.Object,
    face_indices: set[int],
    name: str,
) -> bpy.types.Object:
    source_mesh = source.data
    used_vertices = sorted(
        {
            vertex
            for face_index in face_indices
            for vertex in source_mesh.polygons[face_index].vertices
        }
    )
    vertex_map = {old: new for new, old in enumerate(used_vertices)}
    vertices = [source_mesh.vertices[index].co.copy() for index in used_vertices]
    faces = [
        [vertex_map[index] for index in source_mesh.polygons[face_index].vertices]
        for face_index in sorted(face_indices)
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    weapon = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(weapon)
    weapon.matrix_world = source.matrix_world.copy()
    return weapon


def remove_component_from_source(
    source: bpy.types.Object,
    face_indices: set[int],
) -> None:
    # The accepted candidates are disconnected face islands, so removing them cannot
    # create a hole in the remaining body surface.
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(source.data)
    bm.faces.ensure_lookup_table()
    targets = [bm.faces[index] for index in sorted(face_indices)]
    bmesh.ops.delete(bm, geom=targets, context="FACES")
    bm.to_mesh(source.data)
    bm.free()
    source.data.update()


def separate_merged_weapon(
    hero: str,
    candidate: tuple[bpy.types.Object, set[int], dict],
    result: HeroResult,
) -> bpy.types.Object:
    source, face_indices, _stats = candidate
    name = f"{hero}_weapon"
    weapon = copy_component_to_object(source, face_indices, name)
    remove_component_from_source(source, face_indices)
    result.changes.append(f"оружие отделено от {source.name}")
    return weapon


def clean_weapon_object(
    weapon: bpy.types.Object,
    hero: str,
    result: HeroResult,
) -> None:
    world = weapon.matrix_world.copy()
    removed = 0
    for modifier in list(weapon.modifiers):
        if modifier.type == "ARMATURE":
            weapon.modifiers.remove(modifier)
            removed += 1
    if weapon.parent is not None:
        weapon.parent = None
        weapon.matrix_parent_inverse = Matrix.Identity(4)
        weapon.matrix_world = world
        result.changes.append(f"{weapon.name}: очищен parent")
    if removed:
        result.changes.append(
            f"{weapon.name}: удалено Armature-модификаторов: {removed}"
        )


def find_authored_grip(
    weapon: bpy.types.Object,
) -> tuple[Optional[bpy.types.Object], Optional[str]]:
    expected = normalized_name(f"Grip.Primary.{weapon.name}")
    markers = [
        obj
        for obj in bpy.context.scene.objects
        if normalized_name(obj.name) == expected
        or (
            obj.name.casefold().startswith("grip.primary.")
            and normalized_name(weapon.name) in normalized_name(obj.name)
        )
    ]
    if len(markers) != 1:
        return None, None
    marker = markers[0]
    grip_bone = None
    current = marker
    while current is not None:
        if current.parent_type == "BONE" and current.parent_bone:
            grip_bone = current.parent_bone
            break
        current = current.parent
    if not grip_bone:
        current = weapon
        while current is not None:
            if current.parent_type == "BONE" and current.parent_bone:
                grip_bone = current.parent_bone
                break
            current = current.parent
    return marker, grip_bone


def preserve_grip_marker(
    marker: bpy.types.Object,
    armature: bpy.types.Object,
    grip_bone: Optional[str],
) -> None:
    if not grip_bone or armature.data.bones.get(grip_bone) is None:
        return
    world = marker.matrix_world.copy()
    marker.parent = armature
    marker.parent_type = "BONE"
    marker.parent_bone = grip_bone
    marker.matrix_world = world
    marker["grip_bone"] = grip_bone


def estimate_grip_world(
    weapon: bpy.types.Object,
    armature: bpy.types.Object,
    hand: bpy.types.Bone,
) -> Vector:
    points = [weapon.matrix_world @ vertex.co for vertex in weapon.data.vertices]
    if not points:
        raise RuntimeError(f"Пустой меш оружия: {weapon.name}")
    hand_world = armature.matrix_world @ hand_center_local(hand)
    # The nearest compact set to the hand is substantially safer than assuming a
    # particular world axis for swords, guns, bows, or staffs.
    ranked = sorted(points, key=lambda point: (point - hand_world).length)
    sample_count = max(1, min(len(ranked), max(8, math.ceil(len(ranked) * 0.03))))
    return sum(ranked[:sample_count], Vector()) / sample_count


def set_origin_at_world_point(obj: bpy.types.Object, point: Vector) -> None:
    local_point = obj.matrix_world.inverted() @ point
    obj.data.transform(Matrix.Translation(-local_point))
    obj.matrix_world.translation = point


def export_selected(filepath: Path, objects: Iterable[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    selected = list(dict.fromkeys(objects))
    for obj in selected:
        if obj.name in bpy.context.scene.objects:
            obj.select_set(True)
    if not selected:
        raise RuntimeError(f"Нет объектов для экспорта: {filepath}")
    bpy.context.view_layer.objects.active = selected[0]
    result = bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_apply=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Экспорт не завершён: {result}")


def base_export_objects(
    armature: bpy.types.Object,
    weapons: set[bpy.types.Object],
) -> list[bpy.types.Object]:
    if armature.get("legacy_synthesized"):
        return [
            obj
            for obj in bpy.context.scene.objects
            if obj not in weapons and obj.type in {"ARMATURE", "MESH", "EMPTY"}
        ]
    result = [armature]
    for obj in bpy.context.scene.objects:
        if obj in weapons:
            continue
        if obj.type == "MESH" and mesh_is_rigged_to(obj, armature):
            result.append(obj)
        elif obj.parent == armature and obj.type in {"EMPTY"}:
            result.append(obj)
    return result


def normalize_weapon_for_export(
    weapon: bpy.types.Object,
) -> tuple[Matrix, Matrix]:
    saved_world = weapon.matrix_world.copy()
    saved_data_transform = Matrix.Identity(4)
    # Apply scale/rotation into a temporary data copy, then place the grip origin at zero.
    weapon.data = weapon.data.copy()
    saved_data_transform = saved_world.copy()
    linear = saved_world.to_3x3().to_4x4()
    weapon.data.transform(linear)
    weapon.matrix_world = Matrix.Identity(4)
    return saved_world, saved_data_transform


def validate_output(path: Path) -> None:
    if not path.exists() or path.stat().st_size < 1024:
        raise RuntimeError(f"Некорректный или пустой экспорт: {path}")


def process_hero(path: Path, args: argparse.Namespace) -> HeroResult:
    hero = path.stem
    result = HeroResult(
        hero=hero, source=str(path), mode="dry-run" if args.dry_run else "apply"
    )
    reset_scene()
    import_glb(path)
    result.actions = sorted(action.name for action in bpy.data.actions)
    armature = find_armature(result)
    if armature is None:
        result.scene_objects = scene_diagnostics()
        return result
    result.armature = armature.name
    hand = find_right_hand(armature)
    if hand is None:
        result.diagnostic_bones = [
            bone.name
            for bone in armature.data.bones
            if any(
                token in bone.name.casefold()
                for token in ("hand", "wrist", "arm", "right", "_r", ".r")
            )
        ]
        if not result.diagnostic_bones:
            result.diagnostic_bones = [bone.name for bone in armature.data.bones]
        result.scene_objects = scene_diagnostics()
        result.errors.append(
            "Правая кисть не найдена; проверены: " + ", ".join(HAND_ALIASES)
        )
        return result
    result.hand_bone = hand.name
    socket_valid = audit_socket(armature, hand, result)

    weapons = find_existing_weapons(armature, result)
    merged = find_merged_candidates(armature, hand, set(weapons), result)
    if weapons:
        result.weapon_state = "separate"
    elif len(merged) == 1:
        result.weapon_state = "merged_confident"
    elif len(merged) > 1:
        result.weapon_state = "merged_ambiguous"
        result.warnings.append(
            f"Несколько кандидатов геометрии оружия: {len(merged)}; автоотделение запрещено"
        )
    else:
        result.weapon_state = "not_found"
        result.warnings.append(f"[WARNING] Оружие не найдено для {hero}")

    if args.dry_run:
        needs_changes = not socket_valid or bool(weapons) or len(merged) == 1
        result.status = (
            "ТРЕБУЕТ ИСПРАВЛЕНИЯ" if needs_changes else "УЖЕ БЫЛ В СТАНДАРТЕ"
        )
        if result.errors or (not weapons and len(merged) > 1):
            result.status = "ПРОПУЩЕН/ОШИБКА"
        return result

    if not socket_valid:
        repair_socket(armature, hand.name, result)
        hand = armature.data.bones[hand.name]

    if not weapons and len(merged) == 1:
        weapons = [separate_merged_weapon(hero, merged[0], result)]
    elif not weapons and len(merged) > 1:
        result.errors.append("Оружие не отделено из-за неоднозначной геометрии")
        return result

    for weapon in weapons:
        grip_marker, grip_bone = find_authored_grip(weapon)
        authored_grip = (
            grip_marker.matrix_world.translation.copy() if grip_marker else None
        )
        if grip_marker:
            preserve_grip_marker(grip_marker, armature, grip_bone)
        clean_weapon_object(weapon, hero, result)
        grip = authored_grip or estimate_grip_world(weapon, armature, hand)
        set_origin_at_world_point(weapon, grip)
        if grip_bone:
            weapon["grip_bone"] = grip_bone
        result.changes.append(
            f"{weapon.name}: origin перенесён в авторский Grip.Primary"
            if authored_grip
            else f"{weapon.name}: origin перенесён в оценочную область хвата"
        )

    args.output_heroes.mkdir(parents=True, exist_ok=True)
    args.output_weapons.mkdir(parents=True, exist_ok=True)
    base_path = args.output_heroes / f"{hero}_base.glb"
    export_selected(base_path, base_export_objects(armature, set(weapons)))
    validate_output(base_path)
    result.outputs.append(str(base_path))

    if weapons:
        # Multiple parts are supported: export them together with the primary grip at zero.
        saved_matrices = {obj: obj.matrix_world.copy() for obj in weapons}
        try:
            for weapon in weapons:
                weapon.matrix_world.translation = Vector((0.0, 0.0, 0.0))
            weapon_path = args.output_weapons / f"{hero}_weapon.glb"
            export_selected(weapon_path, weapons)
            validate_output(weapon_path)
            result.outputs.append(str(weapon_path))
        finally:
            for weapon, matrix in saved_matrices.items():
                weapon.matrix_world = matrix

    result.status = "УСПЕШНО ИСПРАВЛЕН" if result.changes else "УЖЕ БЫЛ В СТАНДАРТЕ"
    return result


def write_report(results: list[HeroResult], args: argparse.Namespace) -> None:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "blender_version": bpy.app.version_string,
        "mode": "dry-run" if args.dry_run else "apply",
        "input": str(args.input),
        "output_heroes": str(args.output_heroes),
        "output_weapons": str(args.output_weapons),
        "heroes": [asdict(result) for result in results],
    }
    args.report.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def verify_exports(args: argparse.Namespace) -> int:
    validations = []
    base_files = sorted(args.output_heroes.glob("*_base.glb"))
    for path in base_files:
        item = {"file": str(path), "kind": "base", "valid": False, "issues": []}
        try:
            reset_scene()
            import_glb(path)
            armatures = [
                obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"
            ]
            sockets = [
                (armature.name, armature.data.bones.get(SOCKET_NAME))
                for armature in armatures
                if armature.data.bones.get(SOCKET_NAME)
            ]
            meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
            if not armatures:
                item["issues"].append("Armature отсутствует")
            if not sockets:
                item["issues"].append(f"{SOCKET_NAME} отсутствует")
            else:
                for armature_name, socket in sockets:
                    if socket.parent is None:
                        item["issues"].append(f"{armature_name}: socket без родителя")
                    # glTF has no Blender use_deform field; an imported GLB initializes
                    # it to True even when it was False immediately before export.
                    item.setdefault("notes", []).append(
                        f"{armature_name}: use_deform не проверяется после GLB round-trip"
                    )
            if not meshes:
                item["issues"].append("Меш тела отсутствует")
            item["armatures"] = [obj.name for obj in armatures]
            item["meshes"] = len(meshes)
            item["animations"] = len(bpy.data.actions)
            item["valid"] = not item["issues"]
        except Exception as exc:
            item["issues"].append(f"{type(exc).__name__}: {exc}")
        validations.append(item)
    for path in sorted(args.output_weapons.glob("*_weapon.glb")):
        item = {"file": str(path), "kind": "weapon", "valid": False, "issues": []}
        try:
            reset_scene()
            import_glb(path)
            meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
            armatures = [
                obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"
            ]
            if not meshes:
                item["issues"].append("Меш оружия отсутствует")
            if armatures:
                item["issues"].append("В weapon GLB найден Armature")
            for obj in meshes:
                if armature_modifiers(obj):
                    item["issues"].append(f"{obj.name}: найден Armature-модификатор")
                if obj.parent and obj.parent.type == "ARMATURE":
                    item["issues"].append(f"{obj.name}: parent является Armature")
            if meshes:
                primary = max(meshes, key=lambda obj: len(obj.data.vertices))
                if primary.matrix_world.translation.length > 1e-4:
                    item["issues"].append(
                        f"Основной меш не в нуле: {tuple(round(v, 6) for v in primary.matrix_world.translation)}"
                    )
            item["meshes"] = [obj.name for obj in meshes]
            item["valid"] = not item["issues"]
        except Exception as exc:
            item["issues"].append(f"{type(exc).__name__}: {exc}")
        validations.append(item)
    validation_path = args.report.with_name("hero_standardization_validation.json")
    validation_path.write_text(
        json.dumps(
            {
                "blender_version": bpy.app.version_string,
                "valid": all(item["valid"] for item in validations),
                "files": validations,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    for item in validations:
        log(f"[{'VALID' if item['valid'] else 'INVALID'}] {Path(item['file']).name}")
        for issue in item["issues"]:
            log(f"  {issue}")
    log(f"Отчёт валидации: {validation_path}")
    return 0 if validations and all(item["valid"] for item in validations) else 1


def main() -> int:
    args = parse_args()
    if not args.input.is_dir():
        raise FileNotFoundError(f"Входная папка не найдена: {args.input}")
    if args.verify_only:
        return verify_exports(args)
    sources = sorted(
        path
        for path in args.input.rglob("*.glb")
        if args.output_heroes not in path.parents
        and args.output_weapons not in path.parents
    )
    log(
        f"Blender {bpy.app.version_string}; mode={'DRY_RUN' if args.dry_run else 'APPLY'}"
    )
    log(f"Найдено GLB: {len(sources)}")
    results = []
    for index, path in enumerate(sources, 1):
        log(f"[{index}/{len(sources)}] {path.stem}")
        try:
            result = process_hero(path, args)
        except Exception as exc:
            result = HeroResult(
                hero=path.stem,
                source=str(path),
                mode="dry-run" if args.dry_run else "apply",
                status="ПРОПУЩЕН/ОШИБКА",
            )
            result.errors.append(f"{type(exc).__name__}: {exc}")
            result.errors.append(traceback.format_exc())
        results.append(result)
        log(f"[{result.status}] {result.hero}")
        for warning in result.warnings:
            log(f"  {warning}")
        for error in result.errors:
            log(f"  ERROR: {error.splitlines()[0]}")
    write_report(results, args)
    log(f"Отчёт: {args.report}")
    failed = sum(result.status == "ПРОПУЩЕН/ОШИБКА" for result in results)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
