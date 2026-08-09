# ---- LabRole lookup, never created ----
# Learner Lab constraint: IAM permits no aws_iam_role resource. Both the
# ECS task role and execution role use this same looked-up role, per the
# Learner Lab configuration plan Phase 0.2.
data "aws_iam_role" "lab" {
  name = "LabRole"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ---- ECR ----
resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ---- CloudWatch log group ----
# Explicit retention set, never left unset (which means never expire).
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 7
  tags              = var.tags
}

# ---- ECS cluster ----
resource "aws_ecs_cluster" "this" {
  name = "${var.project_name}-cluster"
  # Container Insights left off: it bills per metric and is not needed to
  # capture the four success-criteria artefacts from the demo spec.
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
  tags = var.tags
}

# ---- Task definition ----
# The environment/secrets split is the load-bearing decision in this
# module. DB_PASSWORD and JWT_SECRET resolve from Secrets Manager at task
# start via the secrets block; everything else is a plain environment
# entry. Moving DB_PASSWORD to environment later as a "simplification"
# would put the password in plaintext in the ECS console and adjacent
# logs — see the infra handoff patch §5 and the config schema decision in
# the Learner Lab configuration plan, Phase 6.
resource "aws_ecs_task_definition" "app" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  task_role_arn            = data.aws_iam_role.lab.arn
  execution_role_arn       = data.aws_iam_role.lab.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "PORT", value = tostring(var.container_port) },
        { name = "DB_HOST", value = var.db_host },
        { name = "DB_PORT", value = tostring(var.db_port) },
        { name = "DB_NAME", value = var.db_name },
        { name = "DB_USER", value = var.db_username },
        { name = "S3_BUCKET", value = var.s3_bucket_name },
        { name = "AUTH_DRIVER", value = "localJwt" },
        { name = "IDENTITY_DRIVER", value = "ecs" },
        { name = "SERVE_STATIC", value = "true" },
        { name = "LOG_LEVEL", value = "info" },
      ]
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.db_secret_arn}:password::"
        },
        {
          name      = "JWT_SECRET"
          valueFrom = var.jwt_secret_arn
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = var.tags
}


# ---- Application Load Balancer ----
resource "aws_lb" "app" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [var.alb_security_group_id]
  tags               = var.tags
}

# Target type must be ip, not instance: Fargate tasks have ENIs, not EC2
# instances. instance produces a target group that never registers
# anything and an ALB that 503s with no obvious cause.
resource "aws_lb_target_group" "app" {
  name        = "${var.project_name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  # Default is 300 seconds, a five-minute wait mid-demo. 30 seconds is
  # enough to show draining without the dead air, per the Learner Lab
  # configuration plan Phase 5 note.
  deregistration_delay = 30

  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ---- ECS service ----
resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # Ensures the listener (and therefore a healthy target group path)
  # exists before ECS starts placing tasks against it.
  depends_on = [aws_lb_listener.http]

  tags = var.tags
}

# ---- Application Auto Scaling ----
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.project_name}-cpu-target-tracking"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 50
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}

# ---- WAF, one-cycle evidence capture (confirmed decision) ----
# REGIONAL scope, attaches directly to the ALB. Not the CLOUDFRONT scope,
# so no us-east-1 provider alias requirement despite already being in
# us-east-1. Bills roughly USD 5-6/month regardless of stack lifetime, so
# enable_waf defaults true for one evidence-capture cycle only, then set
# false in environments/learnerlab.tfvars for every later cycle.
resource "aws_wafv2_web_acl" "alb" {
  count = var.enable_waf ? 1 : 0
  name  = "${var.project_name}-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-managed-common-rules"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.enable_waf ? 1 : 0
  resource_arn = aws_lb.app.arn
  web_acl_arn  = aws_wafv2_web_acl.alb[0].arn
}
