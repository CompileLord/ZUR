# ZUR interactive hero sculpture — 3D production brief

Copy the following brief into a 3D generation tool, or give it to a Blender artist. A rendered image or video does not satisfy the deliverable: we need the actual mesh and material in a GLB file.

Reference: the existing [hero clip](https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260601_110537_3a579fa0-7bbc-4d94-9d25-0e816c7840f5.mp4) and the local `packages/web/public/media/zur-bust-poster.webp`. This brief creates a similar sculpture; it does not promise an exact reconstruction from the video.

## Generation prompt

Create an original, elegant 3D mannequin bust for the ZUR Python learning platform. Use the supplied hero video as a silhouette and pose reference: a smooth bald head, understated human facial structure, a long neck, rounded shoulders, and an upper torso cropped below the chest. It should feel like a quiet contemporary sculpture: curious, thoughtful, and precise. The resting pose is a three-quarter view facing slightly left, toward the page headline. Keep the head anatomically plausible, with a clear nose and jaw, subtle lips and ears, and softly modeled closed or featureless eyes. No hair, teeth, eyelashes, clothing, jewelry, robot panels, seams, lettering, logos, or pedestal.

Use a smooth charcoal ceramic or restrained dark metal material with broad, soft highlights. The silhouette must stay readable on both a warm off-white canvas and a deep olive-charcoal canvas. Use moderate roughness, approximately 0.28–0.40, and moderate metallic response, approximately 0.35–0.60; tune visually rather than making the surface a mirror. Reflections should be neutral with an optional faint citron accent. Do not bake the video’s blue/purple rainbow glow into the material. No neon, emissive effects, rainbow iridescence, glass, transparency on the sculpture, glitter, bloom, or decorative particles. The surrounding scene must be empty; transparency comes from the website’s canvas, not from making the mesh translucent.

Place the object at the origin, upright with Y up. Apply scale and rotation. Keep a simple named hierarchy: a root named `ZurBust`, a pivot at the base of the neck, a head node named `Head`, and a torso node named `Torso`. Rotate head and torso together by default; allow a subtle independent head rotation without exposing gaps in the neck. Supply a single joined-mesh alternative if separate nodes compromise the surface. Maintain clean normals and a smooth silhouette around the nose, skull, ears, neck, and shoulders. The bust must look good when rotated about 35 degrees to either side, not just from one camera angle. No rig, skeleton, blendshapes, or baked animation is needed.

Deliver a real glTF 2.0 binary file named `zur-bust.glb`, with all required materials and resources embedded. Target 10,000–20,000 triangles on desktop, with a second 3,000–6,000 triangle mobile version. Use one or two materials and as few draw calls as possible. Prefer texture-free PBR materials. If detail requires textures, limit each to 1024 pixels and avoid unnecessary maps; supply a KTX2 version only alongside a compatible uncompressed source. Supply an uncompressed GLB and a Meshopt-compressed GLB. Target a total compressed model transfer below 1 MB, preferably below 500 KB; these are delivery budgets, not guarantees. Remove hidden geometry, duplicate vertices, unused resources, lights, camera rigs, and background planes. Include the editable source, triangle count, file sizes, license for commercial web use, and front/three-quarter/side preview renders on light and dark backgrounds.

The artwork will occupy the right half of a desktop hero and sit below the content on mobile. Leave the left side of the website clear for typography. Do not include webpage text, UI controls, borders, backgrounds, or shadows baked into the asset.

## Browser integration requirements

- Use plain TypeScript and Three.js; keep the renderer in a lazy-loaded Landing module.
- Use a transparent WebGL canvas (`alpha: true`) with no background plane, scene background, postprocessing, or full-screen video.
- Start with a stable three-quarter pose. Map pointer position to yaw within ±35° and pitch within ±8°. Ease toward targets; avoid spinning or zooming. On pointer leave, ease back to the resting pose.
- Make the sculpture decorative (`aria-hidden`); never intercept clicks on the headline, links, or pills. Touch scrolling must remain natural.
- Use a soft key light and modest fill. Adapt the lighting to the app theme. Use a small neutral environment map only if needed; include its transfer and memory costs in the budget.
- Cap pixel ratio at 1.5 on desktop and 1 on mobile. Render only while the rotation changes; stop after settling. Cap animation at 30 frames per second, pause outside the viewport or in a hidden tab, and dispose all GPU resources when leaving Landing.
- For reduced motion, show the resting pose without tracking the pointer. On low-power devices, failed WebGL, or failed asset loading, show a lightweight static poster. Keep the headline and navigation immediately usable while the asset loads.
- Test a 1440×900 desktop and a 390×844 phone in both themes. Check load time, triangle count, draw calls, GPU memory, long tasks, rotation smoothness, and route cleanup on representative hardware. A small GLB alone does not guarantee good performance.

## Tools and format references

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) supports glTF models and compression extensions.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) supports transparent canvas rendering and renderer configuration.
- [glTF Transform](https://gltf-transform.dev/) provides geometry, texture, and resource optimization tools.
