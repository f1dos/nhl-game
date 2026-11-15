"""Original development assets. Run with blender --background --python this_file.

These are rigged modelling studies, not accepted final character art.
Units: metres; Blender Z up, glTF Y up. No external artwork is used.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models' / 'hockey'
OUT.mkdir(parents=True, exist_ok=True)

def material(name, color, roughness=.8):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def loft(name, rings, mat, bone, rig, sides=16):
    vertices, faces = [], []
    for x, y, z, rx, ry in rings:
        for i in range(sides):
            a = i * math.tau / sides
            vertices.append((x + rx * math.cos(a), y + ry * math.sin(a), z))
    for j in range(len(rings)-1):
        for i in range(sides):
            a = j*sides+i; b = j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range((len(rings)-1)*sides,len(rings)*sides))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons: polygon.use_smooth = True
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(vertices))), 1, 'REPLACE')
    mod = obj.modifiers.new('Skeleton', 'ARMATURE'); mod.object = rig
    obj.parent = rig
    return obj

def build(goalie=False):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    jersey = material('Jersey / recolourable', (.04,.20,.36))
    dark = material('Protective equipment', (.025,.035,.05))
    white = material('Socks and pads', (.85,.87,.88))
    skin = material('Skin', (.55,.32,.21))
    metal = material('Skate steel', (.35,.4,.45), .25)
    arm = bpy.data.armatures.new('Hockey skeleton')
    rig = bpy.data.objects.new('Goalie' if goalie else 'Skater', arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name); b.head=head; b.tail=tail
        if parent: b.parent=arm.edit_bones[parent]
    bone('root',(0,0,0),(0,0,.2))
    bone('pelvis',(0,0,.86),(0,0,1.02),'root')
    bone('spine',(0,0,1.02),(0,-.1,1.48),'pelvis')
    bone('head',(0,-.1,1.48),(0,-.13,1.8),'spine')
    for sign, side in [(-1,'L'),(1,'R')]:
        bone('thigh.'+side,(sign*.15,0,.93),(sign*.19,-.08,.54),'pelvis')
        bone('shin.'+side,(sign*.19,-.08,.54),(sign*.22,.03,.16),'thigh.'+side)
        bone('upperarm.'+side,(sign*.28,-.07,1.43),(sign*.38,-.16,1.17),'spine')
        bone('forearm.'+side,(sign*.38,-.16,1.17),(sign*.30,-.39,1.02),'upperarm.'+side)
    bpy.ops.object.mode_set(mode='OBJECT')
    loft('Tailored jersey',[(0,0,.92,.22,.14),(0,-.02,1.08,.25,.16),(0,-.05,1.3,.29,.18),(0,-.08,1.44,.31,.16),(0,-.09,1.5,.17,.12)],jersey,'spine',rig)
    loft('Neck',[(0,-.1,1.47,.07,.07),(0,-.11,1.58,.07,.07)],skin,'head',rig)
    loft('Face',[(0,-.13,1.55,.065,.07),(0,-.15,1.61,.09,.1),(0,-.14,1.72,.095,.1),(0,-.12,1.77,.07,.08)],skin,'head',rig)
    loft('Helmet shell',[(0,-.11,1.66,.112,.12),(0,-.11,1.75,.12,.125),(0,-.11,1.81,.09,.105),(0,-.11,1.83,.025,.04)],dark,'head',rig)
    for sign, side in [(-1,'L'),(1,'R')]:
        x=sign*.15
        loft('Hockey pants '+side,[(x,0,.75,.13,.13),(x,0,.9,.145,.15),(x,0,1.02,.13,.14)],dark,'thigh.'+side,rig)
        loft('Leg '+side,[(sign*.22,.03,.16,.075,.08),(sign*.20,-.04,.35,.085,.09),(sign*.19,-.08,.54,.105,.105),(x,0,.8,.1,.11)],white,'shin.'+side,rig)
        loft('Skate boot '+side,[(sign*.22,-.065,.06,.075,.18),(sign*.22,-.065,.12,.085,.18),(sign*.22,.025,.23,.065,.09)],dark,'shin.'+side,rig)
        loft('Blade '+side,[(sign*.22,-.07,.015,.009,.19),(sign*.22,-.07,.05,.009,.19)],metal,'shin.'+side,rig,8)
        loft('Sleeve '+side,[(sign*.38,-.16,1.14,.09,.10),(sign*.35,-.13,1.3,.115,.12),(sign*.27,-.07,1.45,.12,.13)],jersey,'upperarm.'+side,rig)
        loft('Forearm '+side,[(sign*.30,-.39,1.02,.08,.09),(sign*.35,-.28,1.1,.09,.1),(sign*.38,-.16,1.18,.095,.10)],jersey,'forearm.'+side,rig)
        loft('Glove '+side,[(sign*.30,-.42,.96,.09,.10),(sign*.30,-.42,1.05,.11,.12),(sign*.31,-.36,1.11,.09,.1)],dark,'forearm.'+side,rig)
        if goalie:
            loft('Goalie pad '+side,[(sign*.22,-.12,.09,.15,.12),(sign*.22,-.17,.38,.16,.12),(sign*.19,-.20,.65,.155,.1)],white,'shin.'+side,rig,12)
    # Continuous shaft follows the right glove; later IK work will constrain both hands.
    loft('Stick shaft',[(.55,-.55,.06,.018,.025),(.30,-.42,1.04,.018,.025),(.25,-.39,1.22,.018,.025)],dark,'forearm.R',rig,8)
    loft('Stick blade',[(.68,-.55,.025,.17,.025),(.68,-.55,.09,.17,.025)],dark,'forearm.R',rig,8)
    rig.animation_data_create()
    action=bpy.data.actions.new('Skating study'); rig.animation_data.action=action
    for frame in range(1,26):
        phase=(frame-1)/24*math.tau
        for side,offset in [('L',0),('R',math.pi)]:
            p=rig.pose.bones['thigh.'+side]; p.rotation_mode='XYZ'
            p.rotation_euler.x=math.sin(phase+offset)*.24
            p.keyframe_insert('rotation_euler',frame=frame)
    bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=25
    bpy.context.scene.frame_set(1)
    stem='goalie-study' if goalie else 'skater-study'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / (stem+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT / (stem+'.glb')),export_format='GLB',export_animations=True)

build(False)
build(True)
