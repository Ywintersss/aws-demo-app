region       = "us-east-1"
project_name = "aethelgard-demo"
az_count     = 3
use_lab_role = true

# Regular cycles: RDS, no WAF after the first evidence-capture cycle.
# Flip use_aurora and enable_waf per the Learner Lab configuration plan
# §2.1/§2.3 decisions when running a dedicated proof-of-concept cycle.
use_aurora        = false
db_multi_az       = false
db_instance_class = "db.t4g.micro"
enable_waf        = true

db_name     = "aethelgard"
db_username = "aethelgard_app"

container_port = 3000
desired_count  = 2
min_capacity   = 2
max_capacity   = 4

image_tag   = "latest"
app_version = "0.1.0"
