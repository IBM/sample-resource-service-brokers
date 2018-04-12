# Sample Resource Service Brokers

This repository provides sample Open Service Broker (OSB) service brokers for providers to use when integrating services with IBM Cloud. These samples conform to the OSB specification (https://github.com/openservicebrokerapi/servicebroker/blob/v2.12/spec.md). The samples are to be used with the IBM Cloud Resource Management Console (https://console.bluemix.net/onboarding).

These samples include OSB logic for catalog (GET), provision (PUT), bind (PUT), unbind (DELETE), unprovision (DELETE), update service (PATCH) and get service last operation (GET). These samples also include logic for the IBM Cloud extensions of enable (PUT) and state (GET).

## Basic Authentication
Each call into the service broker implementation has an http authorization header. Each call should verify the value. The user and password for this verification correspond to the values provided to the IBM Cloud Resource Management Console.

## Errors
In order to expose error text from a service broker for the provision, bind, unbind, unprovision, update and get service last operation entry points, return a JSON object with a description entry. This error text will be displayed in the IBM Cloud console when invoked due to an action in the IBM Cloud console.

### Sample JSON

```
{
    "description" : "Service failed due to invalid authorization"
}
```
  
## Get Catalog
This REST API will be called to retrieve the list of service offerings and their service plans.

### URL
The URL path for the GET invoked within the service broker implementation is `/v2/catalog`.

## Get Catalog Result
### Result
A status code of 200 is the expected successful value.

The fields returned from a catalog GET within the JSON result are as follows:
- services - an array of service definitions and their service plan definitions. Each array entry consists of the following:
    - bindable - whether the service is bindable or not
    - description - service short description
    - id - ID of the service. This must be unique and should be a GUID and should not be changed once set.
    - metadata - optional hash of values. Valid JSON required if provided.
      - displayName - service name displayed on the IBM Cloud console
      - documentationUrl - service documentation URL
      - imageUrl - service image URL
      - instructionsUrl - service instructions URL
      - longDescription - service long description
      - providerDisplayName - service provider
      - supportUrl - service support Url
      - termsUrl - service terms Url  
    - name - name of the service. This must be unique. This will be the service name provided on `bluemix resource service-instance-create`. Use lowercase and don't include spaces.
    - plan_updatable - optional Boolean indicating whether service instances of the service are plan updateable. Default value is `false` if omitted.
    - tags - optional string array
    - plans - array of service plan definitions. Each array entry consists of the following:
        - description - service plan description
        - free - whether the service plan is free or not. Default is `true`.
        - id - ID of the service plan. Must be unique and should be a GUID and should not be changed once set.
        - metadata - optional hash of values. Valid JSON required if provided.
          - bullets - string array of service plan features
          - displayName - service plan name displayed on the IBM Cloud console
        - name - name of the service plan. This must be unique within the context of the service. This will be the service plan name provided on `bluemix resource service-instance-create`. Use lowercase and don't include spaces.

### Successful Sample JSON

```
{
    "services" :
    [
        {
            "bindable"         : true,
            "description"      : "Test Node Resource Service Broker Description",
            "id"               : "service-guid-here",
            "metadata"         : 
            {
              "displayName           : "Test Node Resource Service Broker Display Name",
              "documentationUrl"     : "http://10.0.1.2/documentation.html,
              "imageUrl"             : "http://10.0.1.2/servicesample.png",
              "instructionsUrl"      : "http://10.0.1.2/servicesample.md",
              "longDescription"      : "Test Node Resource Service Broker Plan Long Description",
              "providerDisplayName"  : "Some Company",
              "supportUrl"           : "http://10.0.1.2/support.html",
              "termsUrl"             : "http://10.0.1.2/terms.html"
            },
            "name"             : "testnoderesourceservicebrokername",
            "plan_updateable"  : true,
            "tags"             : [ "lite", "tag1a", "tag1b" ],
            "plans"            :
            [
                {
                    "description" : "Test Node Resource Service Broker Plan Description",
                    "free"        : true,
                    "id"          : "plan-guid-here",
                    "metadata"    :
                    {
                      "bullets"     : [ "Test bullet 1", "Test bullet 2" ],
                      "displayName" : "Lite"
                    },
                    "name"        : "lite"
                }
            ]
        }
    ]
}
```

## Get Catalog Test

```
curl -X GET -H "Accept:application/json" -H "X-Broker-Api-Version:2.12" -u "TestServiceBrokerUser:TestServiceBrokerPassword" http://localhost:3000/v2/catalog
```

## Provision
### URL
The URL path for the PUT invoked within the service broker implementation is `/v2/service_instances/:instance_id` where `:instance_id` is the id generated by IBM Cloud for the service instance.

### Query Parameters
The fields passed into a provision PUT as query parameters are as follows:
  - accepts_incomplete - optional Boolean signifying whether the client allows asynchronous service provisioning or not. Default value is `false`.
  
### Content
The fields passed into a provision PUT within the JSON body are as follows:
  - context
    - account_id - the id of the account requesting the provision
    - crn - the CRN of the new instance
    - platform - this value will be `ibmcloud`
    - resource-group-crn - the CRN of the resource group
    - target-crn - the CRN of the target
  - parameters - optional JSON object of values to pass to the service broker
  - plan_id - the id of the plan chosen as part of the `bluemix resource service-instance-create`. This will be one of the service plans ID's from get catalog.
  - service_id - the id of the service offering as part of the `bluemix resource service-instance-create`. This will be one of the service ID's from get catalog
  
### Sample JSON

```
{
    "context"      :
    {
        "account_id"        : "account-id-here",
        "crn"               : "crn-here",
        "platform"          : "ibmcloud",
        "resource_group_crn : "resource-group-crn-here",
        "target_crn"        : "target-crn-here"
    },
    "plan_id"      : "plan-guid-here",
    "service_id"   : "service-guid-here"
}
```
  
## Provision Result
### Result
  - A status code of 201 indicates the service instance has been created. The expected successful response body is below.
  - A status code of 200 indicates the service instance already exists and the requested parameters are identical to the existing service instance. The expected successful response body is below.
  - A status code of 202 indicates the service instance is being provisioned asynchronously. Subsequent calls to `/v2/service_instances/:instance_id/last_operation` will be invoked to check creation status. The expected successful response body is below.
  - A status code of 409 signifies provision already done for this URL. The expected response body is `{}`.
  - A status code of 422 signifies an unsupported request. This should be returned if the broker only supports asynchronous processing, but `?accepts_incomplete=true` was not specified on the request. The expected response body includes an error field and an optional user-facing description field:

```
{
    "error"       : "AsyncRequired",
    "description" : "This service plan requires support for asynchronous service operations."
}
```

### Successful Response Body
The fields returned from a successful provision PUT within the JSON result are as follows for a 200/201/202
  - dashboard_url - optional URL for a dashboard for this service instance
  - description   - optional user-facing description
  - operation     - optional value passed into subsequent `/v2/service_instances/:instance_id/last_operation` requests

### Successful Sample JSON

```
{
    "dashboard_url" : "http://www.ibm.com",
    "description"   : "Your service is being created asynchronously.",
    "operation"     : "Provision_45"
}
```

## Provision Test

```
curl -X PUT -H "Accept:application/json" -H "Content-Type:application/json" -H "X-Broker-Api-Version:2.12" -H "X-Broker-Api-Originating-Identity:ibmcloud eyJpYW1faWQiOiJJQk1pZC0zMTAwMDJNNEpGIiwic3ViIjoiYmx1ZW1peF91aV9zb3Rlc3RAbWFpbGluYXRvci5jb20ifQ==" -u "TestServiceBrokerUser:TestServiceBrokerPassword" -d "{\"context\":{\"account_id\":\"499b176abb3e1c9727df87ae48b27c7b\",\"crn\":\"crn:v1:bluemix:public:testjavaresourceservicebrokername:us-south:a\/499b176abb3e1c9727df87ae48b27c7b:7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7::\",\"platform\":\"ibmcloud\",\"resource_group_crn\":\"crn:v1:bluemix:public:resource-controller::a\/499b176abb3e1c9727df87ae48b27c7b::resource-group:2a5f74056b254efbaab5e9e28a711141\",\"target_crn\":\"crn:v1:bluemix:public:resource-catalog::a\/e97a8c01ac694e308ef3ad7795c7cdb3::deployment:e62e2c19-0c3b-41e3-b8b3-c71762ecd489%3Aus-south38399\"}, \"parameters\":{\"parameter1\":1, \"parameter2\":\"value\"}, \"plan_id\":\"e62e2c19-0c3b-41e3-b8b3-c71762ecd489\", \"service_id\":\"cb55391b-3416-4943-a6a6-a541778c1924\"}" http://localhost:3000/v2/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A?accepts_incomplete=true
```


## Bind
### URL
The URL path for the PUT invoked within the service broker implementation is `/v2/service_instances/:instance_id/service_bindings/:binding_id` where `:instance_id` is the id generated by IBM Cloud for the service instance and `:binding_id` is the id generated by IBM Cloud for the service/app binding.

### Content
The fields passed into a bind PUT within the JSON body are as follows:
  - bind_resource - this field can contain information for an app binding and service keys
    - app_guid - this field identifies the application if binding to an application
  - parameters - optional JSON object of values to pass to the service broker
  - plan_id - the id of the plan chosen as part of the `bluemix resource service-instance-create`. This will be one of the service plans ID's from get catalog
  - service_id - the id of the service offering as part of the `bluemix resource service-instance-create`. This will be one of the service ID's from get catalog
    
### Sample JSON

```
{
    "bind_resource :
    {
       "app_guid" : "80e0caaa-4145-4f2a-9bf8-1ab00fff1766"
    },
    "plan_id"      : "plan-guid-here",
    "service_id"   : "service-guid-here"
}
```
 
## Bind Result

### Result
  - A status code of 201 indicates the service binding has been created. The expected successful response body is below.
  - A status code of 200 indicates the service binding already exists and the requested parameters are identical to the existing service binding. The expected successful response body is below.
  - A status code of 409 signifies binding already done for this URL. The expected response body is `{}`.
  - A status code of 422 signifies an unsupported request. This should be returned if the broker requires app_guid to be set. The expected response body includes an error field and an optional user-facing description field:

```
{
    "error"       : "RequiresApp",
    "description" : "This service does not support service keys."
}
```

### Successful Response Body
The fields returned from a bind PUT within the JSON result are as follows for a 200/201:
  - credentials - this is a required hash of credentials
  
### Successful Sample JSON

```
{
    "credentials"   :
    {
        "url"      : "http://10.0.1.2:12345",
        "userid"   : "8401a824-1da7-4114-8664-2460db21661a",
        "password" : "b98e9690-c5e7-405f-9ef6-d6fa36afbaba"
    }
}
```

## Bind Test

```
curl -X PUT -H "Accept:application/json" -H "Content-Type:application/json" -H "X-Broker-Api-Version:2.12" -H "X-Broker-Api-Originating-Identity:ibmcloud eyJpYW1faWQiOiJJQk1pZC0zMTAwMDJNNEpGIiwic3ViIjoiYmx1ZW1peF91aV9zb3Rlc3RAbWFpbGluYXRvci5jb20ifQ==" -u "TestServiceBrokerUser:TestServiceBrokerPassword" -d "{\"bind_resource\":{\"app_guid\":\"d3f16a48-8bd1-4aab-a7de-e2a22ad38292\"}, \"parameters\":{\"parameter1\":1, \"parameter2\":\"value\"}, \"plan_id\":\"e62e2c19-0c3b-41e3-b8b3-c71762ecd489\", \"service_id\":\"cb55391b-3416-4943-a6a6-a541778c1924\"}" http://localhost:3000/v2/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A/service_bindings/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3Aresource-key%3A92dba2e9-86e7-4bb6-8e9f-b14294a41cbd
```


## Unbind

### URL
The URL path for the DELETE invoked within the service broker implementation is `/v2/service_instances/:instance_id/service_bindings/:binding_id` where `:instance_id` is the id generated by IBM Cloud for the service instance and `:binding_id` is the id generated by IBM Cloud for the service/app binding.

### Query Parameters
The fields passed into an unbind DELETE as query parameters are as follows:
  - plan_id - the id of the plan chosen as part of the `bluemix resource service-instance-create`. This will be one of the service plans ID's from get catalog
  - service_id - the id of the service offering as part of the `bluemix resource service-instance-create`. This will be one of the service ID's from get catalog

## Unbind Result

### Result
  - A status code of 200 is the expected successful value handled by IBM Cloud code. The expected successful response body is `{}`.
  - A status code of 410 signifies resource already deleted. The expected successful response body is `{}`.

### Successful Sample JSON

```
{
}
```

## Unbind Test

```
curl -X DELETE -H "Accept:application/json" -H "X-Broker-Api-Version:2.12" -H "X-Broker-Api-Originating-Identity:ibmcloud eyJpYW1faWQiOiJJQk1pZC0zMTAwMDJNNEpGIiwic3ViIjoiYmx1ZW1peF91aV9zb3Rlc3RAbWFpbGluYXRvci5jb20ifQ==" -u "TestServiceBrokerUser:TestServiceBrokerPassword" "http://localhost:3000/v2/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A/service_bindings/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3Aresource-key%3A92dba2e9-86e7-4bb6-8e9f-b14294a41cbd?plan_id=e62e2c19-0c3b-41e3-b8b3-c71762ecd489&service_id=cb55391b-3416-4943-a6a6-a541778c1924"
```


## Unprovision
### URL
The URL path for the DELETE invoked within the service broker implementation is `/v2/service_instances/:instance_id` where `:instance_id` is the id generated by IBM Cloud for the service instance. 

### Query Parameters
The fields passed into an unprovision DELETE as query parameters are as follows:
  - accepts_incomplete - optional Boolean signifying whether the client allows asynchronous service unprovisioning or not. Default value is `false`.
  - plan_id - the id of the plan chosen as part of the `bluemix resource service-instance-create`. This will be one of the service plans ID's from get catalog
  - service_id - the id of the service offering as part of the `bluemix resource service-instance-create`. This will be one of the service ID's from get catalog
  
## Unprovision Result
### Result
  - A status code of 200 is the expected successful value handled by IBM Cloud code. The expected successful response body is below.
  - A status code of 202 indicates the service instance is being unprovisioned asynchronously. Subsequent calls to `/v2/service_instances/:instance_id/last_operation` will be invoked to check creation status. The expected successful response body is below.
  - A status code of 410 signifies resource already deleted. The expected successful response body is below.
  - A status code of 422 signifies an unsupported request. This should be returned if the broker only supports asynchronous processing, but `?accepts_incomplete=true` was not specified on the request. The expected response body includes an error field and an optional user-facing description field:

```
{
    "error"       : "AsyncRequired",
    "description" : "This service plan requires support for asynchronous service operations."
}
```

### Successful Response Body
The fields returned from a successful unprovision DELETE within the JSON result are as follows for a 200/202/410
  - description - optional user-facing description
  - operation   - optional value passed into subsequent `/v2/service_instances/:instance_id/last_operation` requests

### Successful Sample JSON

```
{
    "description" : "Your service instance is being deleted asynchronously.",
    "operation"   : "Unprovision_45"
}
```

## Unprovision Test

```
curl -X DELETE -H "Accept:application/json" -H "X-Broker-Api-Version:2.12" -H "X-Broker-Api-Originating-Identity:ibmcloud eyJpYW1faWQiOiJJQk1pZC0zMTAwMDJNNEpGIiwic3ViIjoiYmx1ZW1peF91aV9zb3Rlc3RAbWFpbGluYXRvci5jb20ifQ==" -u "TestServiceBrokerUser:TestServiceBrokerPassword" "http://localhost:3000/v2/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A?accepts_incomplete=true&plan_id=e62e2c19-0c3b-41e3-b8b3-c71762ecd489&service_id=cb55391b-3416-4943-a6a6-a541778c1924"
```


## Update Service
### URL
The URL path for the PATCH invoked within the service broker implementation is `/v2/service_instances/:instance_id` where `:instance_id` is the id generated by IBM Cloud for the service instance. 

### Query Parameters
The fields passed into an update PATCH as query parameters are as follows:
  - accepts_incomplete - optional Boolean signifying whether the client allows asynchronous service updating or not. Default value is `false`.
  
### Content
The fields passed into an update-service PATCH within the JSON body are as follows:
  - context
    - account_id - the id of the account requesting the provision
    - crn - the CRN of the new instance
    - platform - this value will be `ibmcloud`
    - resource-group-crn - the CRN of the resource group
    - target-crn - the CRN of the target
  - parameters - optional JSON object of values to pass to the service broker
  - plan_id - the id of the new plan chosen as part of the `bluemix resource service-instance-update`. This will be one of the service plans ID's from get catalog
  - previous_values:
    - plan_id - the id of the prior plan chosen as part of the `bluemix resource service-instance-create`. This will be one of the service plans ID's from get catalog
    - service_id - the id of the service offering as part of the `bluemix resource service-instance-create`. This will be one of the service ID's from get catalog
  
### Sample JSON

```
{
    "context"         :
    {
        "account_id"        : "account-id-here",
        "crn"               : "crn-here",
        "platform"          : "ibmcloud",
        "resource_group_crn : "resource-group-crn-here",
        "target_crn"        : "target-crn-here"
    },
    "plan_id"         : "new-plan-guid-here",
    "previous_values" :
    {
        "plan_id"         : "plan-guid-here",
        "service_id"      : "service-guid-here"
    }
}
```
  
## Update Service Result
### Result
  - A status code of 200 indicates the service instance has been updated. The expected successful response body is below.
  - A status code of 202 indicates the service instance is being updated asynchronously. Subsequent calls to `/v2/service_instances/:instance_id/last_operation` will be invoked to check creation status. The expected successful response body is below.
  - A status code of 422 signifies an unsupported request. This should be returned if the broker only supports asynchronous processing, but `?accepts_incomplete=true` was not specified on the request. The expected response body includes an error field and an optional user-facing description field:

```
{
    "error"       : "AsyncRequired",
    "description" : "This service plan requires support for asynchronous service operations."
}
```

### Successful Response Body
The fields returned from a successful update PATCH within the JSON result are as follows for a 200/202
  - description - optional user-facing description
  - operation   - optional value passed into subsequent `/v2/service_instances/:instance_id/last_operation` requests

### Sample Succesful JSON

```
{
    "description" : "Your service instance is being updated asynchronously.",
    "operation"   : "Update_45"
}
```

## Update Service Test

```
curl -X PATCH -H "Accept:application/json" -H "Content-Type:application/json" -H "X-Broker-Api-Version:2.12" -H "X-Broker-Api-Originating-Identity:ibmcloud eyJpYW1faWQiOiJJQk1pZC0zMTAwMDJNNEpGIiwic3ViIjoiYmx1ZW1peF91aV9zb3Rlc3RAbWFpbGluYXRvci5jb20ifQ==" -u "TestServiceBrokerUser:TestServiceBrokerPassword" -d "{\"context\":{\"account_id\":\"499b176abb3e1c9727df87ae48b27c7b\",\"crn\":\"crn:v1:bluemix:public:testjavaresourceservicebrokername:us-south:a\/499b176abb3e1c9727df87ae48b27c7b:7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7::\",\"platform\":\"ibmcloud\",\"resource_group_crn\":\"crn:v1:bluemix:public:resource-controller::a\/499b176abb3e1c9727df87ae48b27c7b::resource-group:2a5f74056b254efbaab5e9e28a7111414\",\"target_crn\":\"crn:v1:bluemix:public:resource-catalog::a\/e97a8c01ac694e308ef3ad7795c7cdb3::deployment:e62e2c19-0c3b-41e3-b8b3-c71762ecd489%3Aus-south38399\"}, \"parameters\":{\"parameter1\":1, \"parameter2\":\"value\"}, \"plan_id\":\"e1031579-4b42-4169-b7cf-f7793c616fdc\", \"previous_values\":{\"plan_id\":\"e62e2c19-0c3b-41e3-b8b3-c71762ecd489\", \"service_id\":\"cb55391b-3416-4943-a6a6-a541778c1924\"}, \"service_id\":\"cb55391b-3416-4943-a6a6-a541778c1924\"}" http://localhost:3000/v2/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A?accepts_incomplete=true
```


## Get Service Instance Last Operation
This REST API will be called intermittently to refresh the current state of an asynchronous service instance operation. This includes provision, unprovision and update.

### URL
The URL path for the GET invoked within the service broker implementation is `/v2/service_instances/:instance_id/last_operation` where `:instance_id` is the id generated by IBM Cloud for the service instance. 

### Query Parameters
The fields passed into a GET last operation as query parameters are as follows:
  - operation - The value operation returned from the related provision/update/unprovision 
  - plan_id - the id of the plan chosen as part of the `bluemix resource service-instance-create`. This will be one of the service plans ID's from get catalog
  - service_id - the id of the service offering as part of the `bluemix resource service-instance-create`. This will be one of the service ID's from get catalog

## Get Service Instance Last Operation Result
### Result
A status code of 200 is the expected successful value handled by IBM Cloud code.

The fields returned from a catalog GET within the JSON result are as follows:
- state - this should be "in progress", "succeeded" or "failed"
- description - optional user-facing message indicating current progress, success or reason for failure 

### Successful Sample JSON

```
{
    "state"       : "succeeded",
    "description" : "The asynchronous creation of your service instance succeeded."
}
```

## Get Service Instance Last Operation Test

```
curl -X GET -H "Accept:application/json" -H "X-Broker-Api-Version:2.12" -u "TestServiceBrokerUser:TestServiceBrokerPassword" "http://localhost:3000/v2/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A/last_operation?operation=Provision_45&plan_id=e62e2c19-0c3b-41e3-b8b3-c71762ecd489&service_id=cb55391b-3416-4943-a6a6-a541778c1924"
```


## Enablement Extension Enable

This extension supports enablement/disablement of a service instance.

### URL
The URL path for the PUT for the service broker implementation is `/bluemix_v1/service_instances/:instance_id` where `:instance_id` is the id generated by IBM Cloud for the service instance.

### Content
The fields passed into an enable PUT within the JSON body are as follows:
  - enabled - a Boolean signifying whether the service instance should be enabled or not 
  - initiator-id - the id of the initiator
  - reason-code - the reason code
    
### Sample JSON

```
{
    "enabled"      : true,
    "initiator_id" : "the ID of the initiator",
    "reason_code"  : "the reason code"
}
```
 
## Enablement Extension Enable Result

### Result
A status code of 204 is the expected successful value

## Enable Extension Enable Test

```
curl -X PUT -H "Content-Type:application/json" -u "TestServiceBrokerUser:TestServiceBrokerPassword" -d "{\"enabled\":true, \"initiator_id\":\"some id\", \"reason_code\":\"some reason code\"}" http://localhost:3000/bluemix_v1/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A
```


## Enablement Extension State

This extension supports retrieving the current state of a service instance.

### URL
The URL path for the GET for the service broker implementation is `/bluemix_v1/service_instances/:instance_id` where `:instance_id` is the id generated by IBM Cloud for the service instance.

## Enablement Extension State Result

### Result
A status code of 200 is the expected successful value.

The fields returned from a state GET within the JSON result are as follows:
  - enabled     - whether the service instance is enabled or not
  - active      - whether the service instance is active or not. Only meaningful if enabled is `true`.
  - last_active - Last accessed/modified in milliseconds since the epoch. Only meaningful if enabled is `true` and active is `false`.
  
### Successful Sample JSON

```
{
    "enabled"    : true,
    "active"     : false,
    "last_active : 1234567890000
}
```

## Enable Extension State Test

```
curl -X GET -H "Accept:application/json" -u "TestServiceBrokerUser:TestServiceBrokerPassword" http://localhost:3000/bluemix_v1/service_instances/crn%3Av1%3Abluemix%3Apublic%3Atestjavaresourceservicebrokername%3Aus-south%3Aa%2F499b176abb3e1c9727df87ae48b27c7b%3A7f0d2b93-fd4a-4ce9-8675-978d20b1e0b7%3A%3A
```
