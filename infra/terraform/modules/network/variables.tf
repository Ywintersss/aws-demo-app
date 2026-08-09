variable "project_name" {
  type = string
}

variable "az_count" {
  description = "Number of Availability Zones to span for both the public and private subnet tiers."
  type        = number
}

variable "container_port" {
  type = number
}

variable "tags" {
  type = map(string)
}
