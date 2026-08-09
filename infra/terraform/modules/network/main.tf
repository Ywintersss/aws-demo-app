data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(var.tags, { Name = "${var.project_name}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = merge(var.tags, { Name = "${var.project_name}-igw" })
}

# --- Public tier: ALB and ECS tasks, one subnet per AZ ---
# No NAT gateway in this profile (roughly USD 32/month plus data charges).
# Fargate tasks in public subnets get assign_public_ip = true instead, so
# they can still reach ECR and pull images; security groups do the actual
# isolating, not subnet placement. This is the documented cost/security
# tradeoff from the 2026-08-06 spec §11.3, carried into the lean profile.
resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.42.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = merge(var.tags, { Name = "${var.project_name}-public-${count.index}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = merge(var.tags, { Name = "${var.project_name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# --- Private tier: database only, one subnet per AZ ---
# Correction over the original scaffold, which put the DB subnet group on
# the same public subnet list as the ALB and ECS tasks. This tier has no
# route to the internet gateway and no NAT (nothing in it needs outbound
# access), so it is free and closes a legitimate reachability criticism.
# See the Learner Lab configuration plan §2, decision 5, and Phase 2.3.
resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.42.${var.az_count + count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = merge(var.tags, { Name = "${var.project_name}-private-${count.index}" })
}

# No route table association needed for the private subnets: the VPC's
# implicit main route table (local traffic only, no 0.0.0.0/0 route) is
# sufficient for a database tier with no outbound requirement.

# No CloudFront in this profile (absent from the Learner Lab permitted
# service list), so the ALB is directly internet-facing over HTTP. This is
# the documented internet-exposure limitation for Section E. WAF (see the
# compute module's enable_waf variable) filters at this same edge when
# enabled, on a REGIONAL-scope web ACL rather than a CLOUDFRONT-scope one.
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description = "HTTP from anywhere, no CloudFront in this profile"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.project_name}-alb-sg" })
}

resource "aws_security_group" "ecs" {
  name_prefix = "${var.project_name}-ecs-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "Container port from the ALB only"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.project_name}-ecs-sg" })
}

resource "aws_security_group" "db" {
  name_prefix = "${var.project_name}-db-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "PostgreSQL from the ECS tasks only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.project_name}-db-sg" })
}
