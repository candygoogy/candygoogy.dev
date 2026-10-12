// The site icon's crop. At 16 to 48px the whole avatar is a blur, so the
// small icons zoom in on its subject (here the flower and the face). A crop
// only fits the picture it was chosen for, so it's tied to that picture's
// SHA-256: for any other avatar, scripts/icons.mjs uses the whole image and
// the build warns, until this is updated.
//
// Read by scripts/icons.mjs (Node runs this file directly, so it has to
// stay plain data).

export const avatarCrop = {
  // SHA-256 of the image file as GitHub serves it (and src/assets/avatar.jpg).
  sha256: "9a102b8d31c44bfacb313dae50f90a48952f6990ccd8b30e8e245dbfa7a81395",
  // Centre of the crop, as a share of the width and the height.
  focus: { x: 0.413, y: 0.37 },
  // 1 is the whole image; 1.7 is a square with 1/1.7 of the side.
  zoom: 1.7,
};
