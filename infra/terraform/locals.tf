locals {
  # Every resource carries these so a forgotten resource is findable in
  # Cost Explorer (2026-08-08 spec §5.2, binding convention 6).
  tags = {
    Project   = var.project_name
    Profile   = "lean"
    ManagedBy = "terraform"
  }
}
