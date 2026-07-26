import bpy
import math
import os
from mathutils import Euler, Vector

PROJECT = r"C:\Users\User\PycharmProjects\TelegramMiniApp"
FPS = 30
HEROES = {
    "fairy-mina": ("source/mina_fairy_geo.fbx", "textures/mina_fairy_tex_highres.png", "fairy"),
    "brock-zeus": ("source/brock_zeus_t-pose.fbx", "textures/brock_zeus_tex.png", "gunner"),
    "kaze": ("source/nested/Model/kaze_geisha_geo.fbx", "textures/kaze_geisha_tex_highres.png", "assassin"),
    "wukong-mico": ("source/nested/Model/mico_wukong_geo.fbx", "textures/mico_wukong_tex_highres.png", "jumper"),
    "damian": ("source/nested/Model/damian_geo.fbx", "textures/damian_tex_highres.png", "mage"),
    "persephone-lumi": ("source/nested/Model/lumi_erebus_geo.fbx", "textures/lumi_erebus_tex_highres.png", "controller"),
}


def first_bone(armature, patterns):
    for pattern in patterns:
        for bone in armature.pose.bones:
            if pattern in bone.name.lower():
                return bone


def rig_parts(armature):
    return {
        "root": first_bone(armature, ["root", "hips", "pelvis"]),
        "hips": first_bone(armature, ["hips", "pelvis"]),
        "spine": first_bone(armature, ["spine_upper", "spine", "chest"]),
        "chest": first_bone(armature, ["chest", "spine_upper", "spine"]),
        "head": first_bone(armature, ["head"]),
        "la": first_bone(armature, ["l_shoulder", "leftarm", "upperarm_l", "arm_l"]),
        "ra": first_bone(armature, ["r_shoulder", "rightarm", "upperarm_r", "arm_r"]),
        "lf": first_bone(armature, ["l_elbow", "leftforearm", "lowerarm_l"]),
        "rf": first_bone(armature, ["r_elbow", "rightforearm", "lowerarm_r"]),
        "ll": first_bone(armature, ["l_upperleg", "leftupleg", "thigh_l"]),
        "rl": first_bone(armature, ["r_upperleg", "rightupleg", "thigh_r"]),
        "wing_l": first_bone(armature, ["wing_l", "l_wing", "leftwing"]),
        "wing_r": first_bone(armature, ["wing_r", "r_wing", "rightwing"]),
        "weapon_l": first_bone(armature, ["l_weapon_s", "l_gunbone", "l_weapon"]),
        "weapon_r": first_bone(armature, ["r_side_a_weapon", "r_weapon_s", "r_weapon"]),
        "weapon_center": first_bone(armature, ["waterball_s", "blade_s"]),
        "microphone": first_bone(armature, ["c_mic_s", "mic_handel", "l_gunbone"]),
        "speaker": first_bone(armature, ["c_speaker_0_s", "lobby_speaker_0_s"]),
    }


def reset(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key(part, frame, rotation=(0, 0, 0), location=None):
    if not part:
        return
    part.rotation_euler = Euler(tuple(math.radians(v) for v in rotation), "XYZ")
    part.keyframe_insert("rotation_euler", frame=frame, group=part.name)
    if location is not None:
        part.location = location
        part.keyframe_insert("location", frame=frame, group=part.name)


def action(armature, parts, name, end, poses):
    reset(armature)
    result = bpy.data.actions.new(name)
    result.use_fake_user = True
    armature.animation_data.action = result
    for frame, values in poses:
        for part_name, transform in values.items():
            key(parts.get(part_name), frame, transform[0], transform[1] if len(transform) > 1 else None)
    result.frame_start, result.frame_end = 1, end


def animations(armature, archetype):
    armature.animation_data_create()
    p = rig_parts(armature)
    hover = .10 if archetype in {"fairy", "mage"} else .035
    action(armature, p, "Idle", 60, [(1,{"root":((0,0,-2),(0,0,0)),"spine":((2,0,-2),)}),(30,{"root":((0,0,2),(0,0,hover)),"spine":((-2,0,2),),"wing_l":((0,12,0),),"wing_r":((0,-12,0),)}),(60,{"root":((0,0,-2),(0,0,0)),"spine":((2,0,-2),)})])
    action(armature, p, "Run", 24, [(1,{"root":((10,0,0),(0,0,0)),"ll":((30,0,0),),"rl":((-30,0,0),),"la":((-25,0,-8),),"ra":((25,0,8),)}),(7,{"root":((8,0,0),(0,0,.08)),"ll":((0,0,0),),"rl":((0,0,0),)}),(13,{"root":((10,0,0),(0,0,0)),"ll":((-30,0,0),),"rl":((30,0,0),),"la":((25,0,-8),),"ra":((-25,0,8),)}),(19,{"root":((8,0,0),(0,0,.08))}),(24,{"root":((10,0,0),(0,0,0)),"ll":((30,0,0),),"rl":((-30,0,0),)})])
    action(armature, p, "Aim", 30, [(1,{"spine":((-4,8,0),),"ra":((-65,0,18),),"rf":((-25,0,0),)}),(30,{"spine":((-4,8,0),),"ra":((-65,0,18),),"rf":((-25,0,0),)})])
    action(armature, p, "AimSuper", 30, [(1,{"spine":((12,0,0),),"la":((-105,0,-30),),"ra":((-105,0,30),),"ll":((18,0,0),),"rl":((18,0,0),)}),(30,{"spine":((12,0,0),),"la":((-105,0,-30),),"ra":((-105,0,30),),"ll":((18,0,0),),"rl":((18,0,0),)})])
    attack_mid = {"spine":((0,-24,0),),"la":((-75,10,-48),),"ra":((-75,-10,48),),"lf":((-55,0,0),),"rf":((-55,0,0),)}
    if archetype == "gunner":
        attack_mid = {"spine":((8,-12,0),),"ra":((-34,0,35),),"rf":((-65,0,0),)}
    elif archetype == "fairy":
        attack_mid = {"spine":((0,28,0),),"ra":((-95,0,45),),"rf":((-45,0,0),),
                      "weapon_center":((0,0,110),(0,-.28,.22))}
    elif archetype == "assassin":
        attack_mid = {"spine":((0,-30,0),),"la":((-92,18,-62),),"ra":((-92,-18,62),),
                      "weapon_l":((20,-65,-95),),"weapon_r":((-20,65,95),)}
    elif archetype == "jumper":
        attack_mid = {"spine":((12,-34,0),),"la":((-105,24,-58),),"lf":((-78,0,0),),
                      "weapon_l":((35,-80,-115),),"microphone":((35,-80,-115),)}
    elif archetype == "mage":
        attack_mid = {"spine":((0,28,0),),"la":((-82,0,-38),),"ra":((-96,0,45),),
                      "microphone":((0,-15,-18),),"speaker":((20,-90,-65),(0,-.55,.35))}
    elif archetype == "controller":
        attack_mid = {"spine":((0,-32,0),),"la":((-112,10,-52),),"ra":((-112,-10,52),),
                      "weapon_l":((25,-70,-105),),"weapon_r":((-25,70,105),)}
    action(armature, p, "Attack", 18, [(1,{"spine":((0,8,0),),"ra":((-55,0,20),)}),(7,attack_mid),(12,{"spine":((0,-30,0),),"la":((-105,0,30),),"ra":((-105,0,-35),)}),(18,{"spine":((0,8,0),),"ra":((-55,0,20),)})])
    action(armature, p, "Super", 45, [(1,{"spine":((8,0,0),),"la":((-70,0,-35),),"ra":((-70,0,35),)}),(18,{"root":((0,0,160),(0,0,.28)),"spine":((-22,0,0),),"la":((-135,0,-15),),"ra":((-135,0,15),),"wing_l":((0,35,0),),"wing_r":((0,-35,0),)}),(32,{"root":((0,0,300),(0,0,.10)),"spine":((28,0,0),),"la":((-35,0,-60),),"ra":((-35,0,60),)}),(45,{"root":((0,0,360),(0,0,0))})])
    action(armature, p, "Spawn", 48, [(1,{"root":((0,0,0),(0,0,-.35)),"spine":((18,0,0),)}),(16,{"root":((0,0,150),(0,0,.30)),"la":((-120,0,-45),),"ra":((-120,0,45),)}),(32,{"root":((0,0,300),(0,0,.12)),"spine":((-12,0,0),)}),(48,{"root":((0,0,360),(0,0,0))})])
    action(armature, p, "Victory", 72, [(1,{"spine":((0,0,0),)}),(24,{"root":((0,0,180),(0,0,.28)),"la":((-125,0,-45),),"ra":((-125,0,45),)}),(48,{"root":((0,0,360),(0,0,.10)),"spine":((-12,0,0),)}),(72,{"root":((0,0,720),(0,0,0))})])
    action(armature, p, "Defeat", 60, [(1,{"spine":((0,0,0),)}),(30,{"root":((35,0,0),(0,0,-.18)),"spine":((28,0,0),),"head":((30,0,0),),"la":((25,0,-15),),"ra":((25,0,15),)}),(60,{"root":((42,0,0),(0,0,-.22)),"spine":((35,0,0),),"head":((38,0,0),)})])
    armature.animation_data.action = bpy.data.actions["Idle"]


def build(slug, model_rel, texture_rel, archetype):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = os.path.join(PROJECT, "frontend", "assets-source", "heroes", slug)
    bpy.ops.import_scene.fbx(filepath=os.path.join(source, model_rel), use_anim=False)
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"} or (obj.name == "Cube" and obj.type == "MESH"):
            bpy.data.objects.remove(obj, do_unlink=True)
    attachment_names = {
        "fairy-mina": (("waterball", "HeroAttachment_FairyOrb_waterball_GEO_hide_ingame", "detached-ammo"),),
        "brock-zeus": (("cloud", "HeroAttachment_Cloud", "attack-cloud"),),
        "kaze": (
            ("blades01", "HeroAttachment_FanLeft", "melee-weapon-left"),
            ("blades02", "HeroAttachment_FanRight", "melee-weapon-right"),
        ),
        "wukong-mico": (("mic_geo", "HeroAttachment_Staff", "melee-weapon-left"),),
        "damian": (
            ("lobby_speaker", "HeroAttachment_MenuSpeaker_lobby_speaker_GEO_hide_ingame", "menu-only"),
            ("speaker_geo", "HeroAttachment_Speaker", "throwable-weapon"),
            ("mic_geo", "HeroAttachment_Microphone", "held-weapon"),
        ),
        "persephone-lumi": (
            ("weapon1", "HeroAttachment_WeaponLeft", "melee-weapon-left"),
            ("weapon2", "HeroAttachment_WeaponRight", "melee-weapon-right"),
        ),
    }
    for obj in bpy.context.scene.objects:
        lowered = obj.name.lower()
        for pattern, exported_name, role in attachment_names.get(slug, ()):
            if pattern in lowered:
                obj.name = exported_name
                obj["attachment_role"] = role
                break
    armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
    if armature is None:
        # Some advertised "T-pose" exports contain skinned geometry but omit
        # the armature object. Recreate a compact humanoid rig so the runtime
        # mixer always has initialized bones and never leaves the hero frozen.
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        corners = [obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
        lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
        hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
        center = (lo + hi) * .5
        height = max(.001, hi.z-lo.z)
        bpy.ops.object.armature_add(enter_editmode=True, location=(center.x, center.y, lo.z))
        armature = bpy.context.object
        edit = armature.data.edit_bones
        base = edit[0]
        base.name, base.head, base.tail = "Root", (0,0,0), (0,0,height*.18)
        def add(name, head, tail, parent=None):
            bone = edit.new(name); bone.head=head; bone.tail=tail; bone.parent=parent; return bone
        hips = add("Hips",(0,0,height*.18),(0,0,height*.32),base)
        spine = add("Spine",(0,0,height*.32),(0,0,height*.58),hips)
        chest = add("Chest",(0,0,height*.58),(0,0,height*.72),spine)
        add("Head",(0,0,height*.72),(0,0,height*.93),chest)
        la=add("L_Shoulder",(0,0,height*.67),(-height*.24,0,height*.66),chest)
        add("L_Elbow",la.tail,(-height*.43,0,height*.53),la)
        ra=add("R_Shoulder",(0,0,height*.67),(height*.24,0,height*.66),chest)
        add("R_Elbow",ra.tail,(height*.43,0,height*.53),ra)
        ll=add("L_UpperLeg",(-height*.09,0,height*.18),(-height*.10,0,-height*.15),hips)
        add("L_LowerLeg",ll.tail,(-height*.10,0,-height*.43),ll)
        rl=add("R_UpperLeg", (height*.09,0,height*.18),(height*.10,0,-height*.15),hips)
        add("R_LowerLeg",rl.tail,(height*.10,0,-height*.43),rl)
        bpy.ops.object.mode_set(mode="OBJECT")
        for mesh in meshes:
            mesh.select_set(True)
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    armature.name = slug + "-rig"
    root = bpy.data.objects.new(slug + "-root", None)
    bpy.context.scene.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    image = bpy.data.images.load(os.path.join(source, texture_rel), check_existing=True)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if not slot.material:
                continue
            slot.material.use_nodes = True
            node = slot.material.node_tree.nodes.get("Image Texture")
            if node:
                node.image = image
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(c) for obj in root.children_recursive if obj.type == "MESH" for c in obj.bound_box]
    lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    scale = 2.45 / max(.001, hi.z-lo.z)
    root.scale = (scale,)*3
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(c) for obj in root.children_recursive if obj.type == "MESH" for c in obj.bound_box]
    lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    root.location = (-(lo.x+hi.x)/2, -(lo.y+hi.y)/2, -lo.z)
    animations(armature, archetype)
    output = os.path.join(PROJECT, "frontend", "public", "assets", "heroes", slug, slug+".glb")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source, slug+".blend"))
    print("BUILT", slug, len(armature.pose.bones), output)


for hero_slug, values in HEROES.items():
    build(hero_slug, *values)
