import bpy
from mathutils import Vector

rig = bpy.data.objects["Hero_Rig"]
body = bpy.data.objects["Body"]
targets = {}

for side, sign in (("R", 1), ("L", -1)):
    points = [
        vertex.co.copy()
        for vertex in body.data.vertices
        if vertex.co.x * sign > 3.75
        and 2.55 < vertex.co.z < 3.85
        and abs(vertex.co.y) < 0.8
    ]
    points = sorted(points, key=lambda point: -point.x * sign)[:80]
    targets[side] = sum(points, Vector()) / len(points)

desired_world_matrices = {}
for side in ("R", "L"):
    weapon = bpy.data.objects[f"Weapon_{side}"]
    handle_points = sorted(
        (vertex.co.copy() for vertex in weapon.data.vertices),
        key=lambda point: abs(point.x),
    )[:40]
    current_grip = sum(handle_points, Vector()) / len(handle_points)
    desired_matrix = weapon.matrix_world.copy()
    desired_matrix.translation += targets[side] - current_grip
    desired_world_matrices[side] = desired_matrix

bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

for side in ("R", "L"):
    palm = targets[side]
    socket = rig.data.edit_bones[f"hand_socket.{side}"]
    socket.head = palm
    socket.tail = palm + Vector((0, 0, 0.45))
    rig.data.edit_bones[f"forearm.{side}"].tail = palm

bpy.ops.object.mode_set(mode="OBJECT")

for side in ("R", "L"):
    weapon = bpy.data.objects[f"Weapon_{side}"]
    weapon.matrix_world = desired_world_matrices[side]
    weapon["visual_grip_aligned"] = True
    weapon["palm_center"] = list(targets[side])
    grip_marker = bpy.data.objects.get(f"weapon_grip.{side}")
    if grip_marker:
        grip_marker.matrix_world.translation = targets[side]

bpy.context.scene["visual_grip_verified"] = True
bpy.ops.wm.save_as_mainfile(
    filepath=r"C:\Users\User\PycharmProjects\TelegramMiniApp\hero_weapon_grip_fixed.blend"
)
