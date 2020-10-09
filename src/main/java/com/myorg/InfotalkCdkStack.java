package com.myorg;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import software.amazon.awscdk.core.CfnOutput;
import software.amazon.awscdk.core.Construct;
import software.amazon.awscdk.core.Stack;
import software.amazon.awscdk.core.StackProps;
import software.amazon.awscdk.services.ec2.ISubnet;
import software.amazon.awscdk.services.ec2.Vpc;
import software.amazon.awscdk.services.sam.CfnFunction;
import software.amazon.awscdk.services.sam.CfnFunction.ApiEventProperty;
import software.amazon.awscdk.services.sam.CfnFunction.EventSourceProperty;
import software.amazon.awscdk.services.sam.CfnFunction.VpcConfigProperty;

public class InfotalkCdkStack extends Stack {
    public InfotalkCdkStack(final Construct parent, final String id) {
        this(parent, id, null);
    }

    public InfotalkCdkStack(final Construct parent, final String id, final StackProps props) {
        super(parent, id, props);

        Vpc myVpc = Vpc.Builder.create(this, "infotalk-lambda-vpc")
            .natGateways(1)
            .build();

        List<String> subnetIdList = new ArrayList<String>();
        for (ISubnet subnet : myVpc.getPrivateSubnets()) {
            subnetIdList.add(subnet.getSubnetId());
        }
        List<String> sgList = new ArrayList<String>();
        sgList.add(myVpc.getVpcDefaultSecurityGroup());

        Map<String, Object> myEventMap = new HashMap<String , Object>();
        EventSourceProperty myEventSource = EventSourceProperty.builder()
            .properties(ApiEventProperty.builder().path("/infotalk").method("post").build())
            .type("Api").build();
        myEventMap.put("infotalkapi", myEventSource);

        CfnFunction.Builder.create(this, "infotalkfunction")
            .functionName("infotalkfunction")
            .handler("submit.lambdaHandler")
            .runtime("nodejs12.x")
            .codeUri("transcribe/")
            .timeout(600)
            .policies("AmazonS3FullAccess")
            .vpcConfig(VpcConfigProperty.builder().subnetIds(subnetIdList).securityGroupIds(sgList).build())
            .events(myEventMap)
            .build();

        CfnOutput.Builder.create(this, "vpcId").value(myVpc.getVpcId()).build();
    }
}
