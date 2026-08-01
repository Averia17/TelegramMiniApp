export class AimRenderer {
  constructor(root) {
    this.root = root
    this.root.visible = false
  }

  update() {
    // Direction guides are intentionally not rendered; attacks communicate through the hero pose and hit feedback.
    this.root.visible = false
  }
}
