provider "aws" {
  region = var.region
}

# Reserved for a future CLOUDFRONT-scope WAF web ACL, which AWS requires to
# be created in us-east-1 regardless of the stack's home region. Not used
# in this build since profile lean has no CloudFront (see enable_waf in
# variables.tf, which is a REGIONAL-scope ACL on the ALB instead). Kept as
# a documented extension point rather than deleted, per the 2026-08-08
# Learner Lab configuration plan §2.1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
