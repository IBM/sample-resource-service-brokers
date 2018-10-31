/*
 * Sample IBM Cloud node.js Resource Service Broker.
 */
var basicAuthConnect = require('basic-auth-connect');
var bodyParser       = require('body-parser');
var express          = require("express");
var fs               = require("fs");
var http             = require("http");
var https            = require("https");
var querystring      = require("querystring");
var url              = require("url");
var uuid             = require("uuid/v4");

// TODO - This service name must be unique within an IBM Cloud environment's set of service offerings
var SERVICE_NAME = "testnoderesourceservicebrokername";

// TODO - Change your basic authentication credentials
var SERVICE_BROKER_USER     = "TestServiceBrokerUser";
var SERVICE_BROKER_PASSWORD = "TestServiceBrokerPassword";

// TODO - Change your client secret
var CLIENT_ID     = SERVICE_NAME;
var CLIENT_SECRET = "";

// TODO - Change your API key value
var API_KEY = "";

// TODO - Whether asynchronous operations are supported or not
var ASYNC_SUPPORTED = false;

// TODO - If asynchronous operation is required due to time requirements
var ASYNC_REQUIRED = false;

// TODO - Whether service keys are supported or not
var SERVICE_KEYS_SUPPORTED = true;

var IAM_ENDPOINT          = "https://iam.cloud.ibm.com";
var IAM_IDENTITY_ENDPOINT = IAM_ENDPOINT + "/identity/.well-known/openid-configuration";

var PORT = process.env.PORT || 3000;

var connected = function()
{
    console.log("Node server started on %s", Date(Date.now()));
};

/*
var sslkey  = fs.readFileSync("key.pem");
var sslcert = fs.readFileSync("cert.pem");
            
var httpsOptions = 
{
    key :sslkey,
    cert:sslcert
};
*/

var checkContentType = function(request, response)
{
    if (request.is("json"))
    {
        return;
    }

    var json = 
    {
        description : "Content-Type must be application/json"
    };

    response.status(415).json(json);

    throw json;
};

var checkAccept = function(request, response)
{
    if (request.accepts("json"))
    {
        return;
    }

    var json = 
    {
        description : "Accept type must be application/json"
    };

    response.status(406).json(json);

    throw json;
};

var getOriginatingIdentity = function(request)
{
    var originatingIdentityHeader = request.get("x-broker-api-originating-identity");

    if (originatingIdentityHeader != null)
    {
        var strings  = originatingIdentityHeader.split(" ");
        var platform = strings[0];
        var value    = JSON.parse(new Buffer(strings[1], "base64").toString("ascii"));

        return { 
                   platform: platform,
                   value   : value
               };
    }
    else
    {
        return {};
    }
};

var getObject = function(json, name, required, response)
{
    var value = json[name];

    if (value == undefined && required) 
    {
        var jsonError = 
        {
            description : name + " not found in JSON payload"
        };

        response.status(400).json(jsonError);

        throw jsonError;
    }

    return value;
};

var getBoolean = function(json, name, required, response)
{
    var value = getObject(json, name, required, response);

    if (value == undefined)
    {
        return value;
    }

    if (!(typeof value == "boolean"))
    {
        var jsonError = 
        {
            description : name + " must be Boolean"
        };

        response.status(400).json(jsonError);

        throw jsonError;
    }

    return value;
};

var getJSON = function(json, name, required, response)
{
    var value = getObject(json, name, required, response);

    if (value == undefined)
    {
        return value;
    }

    if (!(typeof value == "object"))
    {
        var jsonError = 
        {
            description : name + " must be a JSON object"
        };
        
        response.status(400).json(jsonError);
        
        throw jsonError;
    }

    return value;
};

var getJSONArrayEntry = function(json, name, index, required, response)
{
    var value = getObject(json, name, required, response);

    if (value == undefined)
    {
        return value;
    }

    if (!(value instanceof Array))
    {
        var jsonError = 
        {
            description : name + " must be an Array"
        };

        response.status(400).json(jsonError);

        throw jsonError;
    }

    if (index >= value.length)
    {
        var jsonError = 
        {
            description : name + " must be an Array of at least length " + (index + 1)
        };

        response.status(400).json(jsonError);

        throw jsonError;
    }
    
    var arrayEntry = value[index];

    if (!(typeof arrayEntry == "object"))
    {
        var jsonError = 
        {
            description : name + " must be an Array of JSON object"
        };

        response.status(400).json(jsonError);

        throw jsonError;
    }

    return arrayEntry;
};

var getString = function(json, name, required, response)
{
    var value = getObject(json, name, required, response);

    if (value == undefined)
    {
        return value;
    }

    var text = null;

    if (!(typeof value == "string"))
    {
        text = name + " must be string";
    }
    else if (value.trim().length == 0)
    {
        text = name + " cannot be empty";
    }

    if (text)
    {
        var jsonError = 
        {
            description : text
        };
        
        response.status(400).json(jsonError);
        
        throw jsonError;
    }

    return value;
};

var getSSORedirectURI = function(request)
{
    return request.protocol + "://" + request.get("host") + "/sso_dashboard";
};

var doHTTP = function(urlString, method, authorization, contentType, content, response, callback)
{
    var localCallback = function(localResponse)
    {
        try
        {
            localResponse.on("error", function(error)
            {
                console.log("Got error: %s", error);
 
                var jsonError = 
                {
                    description : "Error: " + error
                };
            
                response.status(500).json(jsonError);

                throw jsonError;
            });

            var data = null;

            localResponse.on("data", function(chunk)
            {
                if (data == null)
                {
                    data = chunk;
                }
                else
                {
                    data = data + chunk;
                }
            });

            localResponse.on("end", function()
            {
                var json = null;

                if (data != null)
                {
                    json = JSON.parse(data);
                }

                var statusCode = localResponse.statusCode;

                if (statusCode == 200)
                {
                    console.log("%s to %s successful. Response: %j", method, urlString, json);
                    
                    callback(json);
                }
                else if (statusCode == 400)
                {
                    console.log("%s to %s is invalid. Response: %j", method, urlString, json);

                    callback(null);
                }
                else if (statusCode == 401)
                {
                    console.log("%s to %s is unauthorized. Response: %j", method, urlString, json);

                    callback(null);
                }
                else if (statusCode == 403)
                {
                    console.log("%s to %s is forbidden. Response: %j", method, urlString, json);

                    callback(null);
                }
                else if (statusCode == 404)
                {
                    console.log("%s to %s is not found. Response: %j", method, urlString, json);

                    callback(null);
                }
                else
                {
                    var jsonError = 
                    {
                        description : "Unexpected return code from url " + urlString + " is " + statusCode
                    };

                    response.status(statusCode).json(jsonError);

                    throw jsonError;
                }
            });
        }
        catch(exception)
        {
            console.log(exception);
        }
    };

    var parsedUrl = url.parse(urlString);

    var requestor = http;

    if (parsedUrl.protocol == "https:")
    {
        requestor = https;
    }

    var headers = 
    {
        "accept" : "application/json"
    };

    if (authorization != null)
    {
        headers["authorization"] = authorization;
    }

    if (contentType != null)
    {
        headers["content-type"] = contentType;
    }

    if (content != null)
    {
        headers["content-length"] = content.length;
    }

    var options = 
    {
        host   : parsedUrl.host, 
        port   : parsedUrl.port, 
        path   : parsedUrl.path, 
        method : method, 
        headers: headers
    };

    var localRequest = requestor.request(options, localCallback);

    if (content != null)
    {
        localRequest.write(content);
    }

    localRequest.end();
};

var iamIdentityEndpoint = function(request, response, endpoint, callback)
{
    var localCallback = function(json)
    {
        try
        {
            if (json == null)
            {
                var jsonError = 
                {
                    description : "Unable to retrieve from " + IAM_IDENTITY_ENDPOINT
                };

                response.status(500).json(jsonError);

                throw jsonError;
            }

            callback(getString(json, endpoint, true, response));
        }
        catch(exception)
        {
            console.log(exception);
        }
    };

    doHTTP(IAM_IDENTITY_ENDPOINT, "GET", null, null, null, response, localCallback);
};

var accessToken = function(request, response, tokenEndpoint, code, callback)
{
    var authorization = "Basic " + new Buffer(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64");

    var content = querystring.stringify(
    {    
        "client_id"     : CLIENT_ID,
        "client_secret" : CLIENT_SECRET,
        "code"          : code,
        "grant_type"    : "authorization_code",
        "redirect_uri"  : getSSORedirectURI(request),
        "response_type" : "cloud_iam"
    });

    var localCallback = function(json)
    {
        try
        {
            if (json == null)
            {
                callback(null);
            }
            else
            {
                var accessToken = getString(json, "access_token", true, response);

                console.log("accessToken: %s", accessToken);

                callback(tokenEndpoint, accessToken);
            }
        }
        catch(exception)
        {
            console.log(exception);
        }
    };

    doHTTP(tokenEndpoint, "POST", authorization, "application/x-www-form-urlencoded", content, response, localCallback);
};

var apiKeyToken = function(request, response, accessTokenResult, callback)
{
    var urlString = IAM_ENDPOINT + "/identity/token";

    var content = querystring.stringify(
    {    
        "apikey"        : API_KEY,
        "grant_type"    : "urn:ibm:params:oauth:grant-type:apikey",
        "response_type" : "cloud_iam"
    });

    var localCallback = function(json)
    {
        try
        {
            if (json == null)
            {
                callback(null, null);
            }
            else
            {
                var accessToken = getString(json, "access_token", true, response);

                console.log("apiKeyToken: %s", accessToken);

                callback(accessTokenResult, accessToken);
            }
        }
        catch(exception)
        {
            console.log(exception);
        }
    };

    doHTTP(urlString, "POST", null, "application/x-www-form-urlencoded", content, response, localCallback);
};

var manageServiceInstance = function(request, response, accessToken, apiToken, instanceId, callback)
{
    var accessTokenBodyJSON = null;

    try
    {
        accessTokenBodyJSON = JSON.parse(new Buffer(accessToken.split(".")[1], "base64").toString("ascii"));

        console.log("Decoded access token body: %j", accessTokenBodyJSON);
    }
    catch(exception)
    {
        var jsonError = 
        {
            description : exception
        };
    
        response.status(500).json(jsonError);

        throw jsonError;
    }

    var iam_id = getString(accessTokenBodyJSON, "iam_id", true, response);
    var scope  = getString(accessTokenBodyJSON, "scope", true, response);

    var urlString = IAM_ENDPOINT + "/v2/authz";

    var content = 
    [
        {
            subject :
            {
                attributes :
                {
                    id    : iam_id,
                    scope : scope
                }
            },
            resource :
            {
                crn : instanceId
            },
            action : SERVICE_NAME + ".dashboard.view"
        }
    ];

    console.log("manageServiceInstance content: %j", content);

    var localCallback = function(json)
    {
        try
        {
            if (json == null)
            {
                callback(false);
            }
            else
            {
                var arrayEntry = getJSONArrayEntry(json, "responses", 0, true, response);
                var status     = getString(arrayEntry, "status", true, response);

                if (status != "200")
                {
                    console.log("Unable to retrieve /v2/authz. Got status: %s", status);

                    var jsonError = 
                    {
                        description : "Error: " + status
                    };

                    response.status(500).json(jsonError);

                    throw jsonError;
                }

                var authorizationDecision = getObject(arrayEntry, "authorizationDecision", true, response);
                callback(getBoolean(authorizationDecision, "permitted", true, response));
            }
        }
        catch(exception)
        {
            console.log(exception);
        }
    };

    doHTTP(urlString, "POST", apiToken, "application/json", JSON.stringify(content), response, localCallback);
};

// GET for testing. Not invoked by IBM Cloud.
var get = function(request, response)
{
    console.log("GET / request headers: %j", request.headers);

    response.status(200).send("This is a test");
};

var catalog = function(request, response)
{
    console.log("GET /v2/catalog request headers: %j", request.headers);

    try
    {
        checkAccept(request, response);

        var originatingIdentity = getOriginatingIdentity(request);
        console.log("GET /v2/catalog originating identity: %s", JSON.stringify(originatingIdentity));

        var baseMetadataUrl = request.protocol + "://" + request.get("host") + "/";

        var result = 
        {
            services :
            [
                {
                    bindable         : true,
                    description      : "Test Node Resource Service Broker Description",
                    // TODO - GUID generated by http://www.guidgenerator.com
                    // TODO - This service id must be unique within an IBM Cloud environment's set of service offerings
                    id               : "df35cab6-347b-4ba5-8f39-e9c23a237f5b",
                    metadata         : 
                    {
                        displayName         : "Test Node Resource Service Broker Display Name",
                        documentationUrl    : baseMetadataUrl + "documentation.html",
                        imageUrl            : baseMetadataUrl + "services.svg", // Copied from https://github.com/carbon-design-system/carbon-icons/blob/master/src/svg/services.svg
                        instructionsUrl     : baseMetadataUrl + "instructions.html",
                        longDescription     : "Test Node Resource Service Broker Long Description",
                        providerDisplayName : "Company Name",
                        supportUrl          : baseMetadataUrl + "support.html",
                        termsUrl            : baseMetadataUrl + "terms.html"
                    },
                    name             : SERVICE_NAME,
                    // TODO - Ensure this value is accurate for your service. Requires PATCH of /v2/service_instances/:instance_id below if true
                    plan_updateable  : true,
                    tags             : ["lite", "tag1a", "tag1b"],
                    plans            :
                    [
                        {
                            bindable    : true,
                            description : "Test Node Resource Service Broker Plan Description",
                            free        : true,
                            // TODO - GUID generated by http://www.guidgenerator.com
                            // TODO - This service plan id must be unique within an IBM Cloud environment's set of service plans
                            id          : "2a1d139b-1b05-4e33-b72e-a1f8c14be559",
                            metadata    :
                            {
                                bullets     : ["Test bullet 1", "Test bullet 2"],
                                displayName : "Lite"
                            },
                            // TODO - This service plan name must be unique within the containing service definition
                            name        : "lite"
                        }
                    ]
                }
            ]
        };

        console.log("GET /v2/catalog result: %j", result);

        response.status(200).json(result);
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var provision = function(request, response)
{
    var instanceId        = request.params.instance_id;
    var acceptsIncomplete = request.query.accepts_incomplete || false;

    console.log("PUT /v2/service_instances/%s?accepts_incomplete=%s request headers: %j", instanceId, acceptsIncomplete, request.headers);

    try
    {
        checkContentType(request, response);
        checkAccept(request, response);

        var originatingIdentity = getOriginatingIdentity(request);
        console.log("PUT /v2/service_instances/%s?accepts_incomplete=%s originating identity: %s", instanceId, acceptsIncomplete, JSON.stringify(originatingIdentity));

        var body = request.body;

        console.log("PUT /v2/service_instances/%s?accepts_incomplete=%s body: %j", instanceId, acceptsIncomplete, body);

        var s    = JSON.stringify(request.body);
        var json = JSON.parse(s);

        var context    = getJSON(json, "context", true, response);
        var parameters = getJSON(json, "parameters", false, response); // Optional
        var planId     = getString(json, "plan_id", true, response);
        var serviceId  = getString(json, "service_id", true, response);

        var platform = getString(context, "platform", true, response);

        // IBM Cloud context fields
        var accountId        = null;
        var crn              = null;
        var resourceGroupCRN = null;
        var targetCRN        = null;

        if (platform == "ibmcloud")
        {
            // Retrieve the various IBM Cloud-specific context fields
            accountId        = getString(context, "account_id", true, response);
            crn              = getString(context, "crn", true, response);
            resourceGroupCRN = getString(context, "resource_group_crn", true, response);
            targetCRN        = getString(context, "target_crn", true, response);
        }

        var result;
        var status;

        // If the service only supports asynchronous operations and acceptsIncomplete is not true
        if (ASYNC_SUPPORTED && ASYNC_REQUIRED && !acceptsIncomplete)
        {
            result = 
            {
                error       : "AsyncRequired",
                description : "This service plan requires client support for asynchronous service operations." // TODO - This optional field is a user-facing message
            };

            status = 422;
        }
        else
        {
            var dashboardUrl = request.protocol + "://" + request.get("host") + "/dashboard/" + encodeURIComponent(instanceId);

            // TODO - If the service instance is requested as asynchronous (and time is needed to provision beyond the standard timeout)
            if (ASYNC_SUPPORTED && acceptsIncomplete)
            {
                // TODO - Kick off your asynchronous work here

                result = 
                {
                    dashboard_url : dashboardUrl,
                    description   : "This service instance is being created asynchronously for you.", // TODO - This optional field is a user-facing message.
                    operation     : "Test provision" // Passed in on subsequent fetch requests
                };

                status = 202;
            }
            else
            {
                // TODO - Do your actual synchronous work here

                result = 
                {
                    dashboard_url : dashboardUrl
                };

                // Created response, but does not expect URL
                status = 201;
            }
        }

        console.log("PUT /v2/service_instances/%s?accepts_incomplete=%s status: %d, result: %j", instanceId, acceptsIncomplete, status, result);

        response.status(status).json(result); // Return 409 if already provisioned at this url
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var bind = function(request, response)
{
    var instanceId = request.params.instance_id;
    var bindingId  = request.params.binding_id;

    console.log("PUT /v2/service_instances/%s/service_bindings/%s request headers: %j", instanceId, bindingId, request.headers);

    try
    {
        checkContentType(request, response);
        checkAccept(request, response);

        var originatingIdentity = getOriginatingIdentity(request);
        console.log("PUT /v2/service_instances/%s/service_bindings/%s originating identity: %s", instanceId, bindingId, JSON.stringify(originatingIdentity));

        var body = request.body;

        console.log("PUT /v2/service_instances/%s/service_bindings/%s body: %j", instanceId, bindingId, body);

        var s    = JSON.stringify(request.body);
        var json = JSON.parse(s);

        var bindResource = getJSON(json, "bind_resource", false, response); // Not required if for service_key
        var context      = getJSON(json, "context", false, response); // Not available until OSB 2.13
        var parameters   = getJSON(json, "parameters", false, response); // Optional
        var planId       = getString(json, "plan_id", true, response);
        var serviceId    = getString(json, "service_id", true, response);
        var appGuid      = null

        if (bindResource != null)
        {
            appGuid = getString(bindResource, "app_guid", false, response); // Only required if binding app to service instance
        }

        if (context != null)
        {
            var platform = getString(context, "platform", true, response);

            if (platform == "ibmcloud")
            {
                // Retrieve the various IBM Cloud-specific context fields here
            }
        }

        var result;
        var status;

        // If appGUID not provided and service keys are not supported
        if (appGuid == null && !SERVICE_KEYS_SUPPORTED)
        {
            result = 
            {
                error       : "RequiresApp",
                description : "This service supports generation of credentials through binding an application only." // TODO - This optional field is a user-facing message
            };

            status = 422;
        }
        else
        {
            // TODO - Do your actual work here

            var generatedUserid   = uuid();
            var generatedPassword = uuid();

            result = 
            {
                credentials : 
                {
                    userid   : generatedUserid,
                    password : generatedPassword
                }
            };

            // Created response, but does not expect URL
            status = 201;
        }

        console.log("PUT /v2/service_instances/%s/service_bindings/%s status: %d, result: %j", instanceId, bindingId, status, result);

        response.status(status).json(result); // Return 409 if already bound at this url
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var unbind = function(request, response)
{
    var instanceId = request.params.instance_id;
    var bindingId  = request.params.binding_id;
    var planId     = request.query.plan_id;
    var serviceId  = request.query.service_id;

    console.log("DELETE /v2/service_instances/%s/service_bindings/%s?plan_id=%s&service_id=%s request headers: %j", instanceId, bindingId, planId, serviceId, request.headers);

    try
    {
        checkAccept(request, response);

        var originatingIdentity = getOriginatingIdentity(request);
        console.log("DELETE /v2/service_instances/%s/service_bindings/%s?plan_id=%s&service_id=%s originating identity: %s", instanceId, bindingId, planId, serviceId, JSON.stringify(originatingIdentity));

        // TODO - Do your actual work here

        var result = {};

        console.log("DELETE /v2/service_instances/%s/service_bindings/%s?plan_id=%s&service_id=%s result: %j", instanceId, bindingId, planId, serviceId, result);

        response.status(200).json(result); // Return 410 with body of {} if previously deleted
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var unprovision = function(request, response)
{
    var instanceId        = request.params.instance_id;
    var acceptsIncomplete = request.query.accepts_incomplete || false;
    var planId            = request.query.plan_id;
    var serviceId         = request.query.service_id;

    console.log("DELETE /v2/service_instances/%s?accepts_incomplete=%s&plan_id=%s&service_id=%s request headers: %j", instanceId, acceptsIncomplete, planId, serviceId, request.headers);

    try
    {
        checkAccept(request, response);

        var originatingIdentity = getOriginatingIdentity(request);
        console.log("DELETE /v2/service_instances/%s?accepts_incomplete=%s&plan_id=%s&service_id=%s originating identity: %s", instanceId, acceptsIncomplete, planId, serviceId, JSON.stringify(originatingIdentity));

        var result;
        var status;

        // If the service only supports asynchronous operations and acceptsIncomplete is not true
        if (ASYNC_SUPPORTED && ASYNC_REQUIRED && !acceptsIncomplete)
        {
            result =
            {
                error       : "AsyncRequired",
                description : "This service plan requires client support for asynchronous service operations." // TODO - This optional field is a user-facing message
            };

            status = 422;
        }
        // TODO - Else if the service instance is requested as asynchronous (and time is needed to deprovision beyond the standard timeout)
        else if (ASYNC_SUPPORTED && acceptsIncomplete)
        {
            // TODO - Kick off your asynchronous work here

            result =
            {
                description : "This service instance is being deleted asynchronously for you.", // TODO - This optional field is a user-facing message.
                operation   : "Test deprovision" // Passed in on subsequent fetch requests
            };

            status = 202;
        }
        else
        {
            // TODO - Do your actual synchronous work here

            result = {};
            status = 200;
        }

        console.log("DELETE /v2/service_instances/%s?accepts_incomplete=%s&plan_id=%s&service_id=%s status: %d, result: %j", instanceId, acceptsIncomplete, planId, serviceId, status, result);

        response.status(status).json(result); // Return 410 with body of {} if previously deleted
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var update = function(request, response)
{
    var instanceId        = request.params.instance_id;
    var acceptsIncomplete = request.query.accepts_incomplete || false;

    console.log("PATCH /v2/service_instances/%s?accepts_incomplete=%s request headers: %j", instanceId, acceptsIncomplete, request.headers);

    try
    {
        checkContentType(request, response);
        checkAccept(request, response);

        var originatingIdentity = getOriginatingIdentity(request);
        console.log("PATCH /v2/service_instances/%s?accepts_incomplete=%s originating identity: %s", instanceId, acceptsIncomplete, JSON.stringify(originatingIdentity));

        var body = request.body;

        console.log("PATCH /v2/service_instances/%s?accepts_incomplete=%s body: %j", instanceId, acceptsIncomplete, body);

        var s    = JSON.stringify(request.body);
        var json = JSON.parse(s);

        var context        = getJSON(json, "context", true, response);
        var parameters     = getJSON(json, "parameters", false, response); // Optional
        var planId         = getString(json, "plan_id", true, response);
        var previousValues = getJSON(json, "previous_values", true, response);
        var previousPlanId = getString(previousValues, "plan_id", true, response);
        var serviceId      = getString(json, "service_id", true, response);

        var platform = getString(context, "platform", true, response);

        // IBM Cloud context fields
        var accountId        = null;
        var crn              = null;
        var resourceGroupCRN = null;
        var targetCRN        = null;

        if (platform == "ibmcloud")
        {
            // Retrieve the various IBM Cloud-specific context fields
            accountId        = getString(context, "account_id", true, response);
            crn              = getString(context, "crn", true, response);
            resourceGroupCRN = getString(context, "resource_group_crn", true, response);
            targetCRN        = getString(context, "target_crn", true, response);
        }

        var result;
        var status;

        // If the service only supports asynchronous operations and acceptsIncomplete is not true
        if (ASYNC_SUPPORTED && ASYNC_REQUIRED && !acceptsIncomplete)
        {
            result =
            {
                error       : "AsyncRequired",
                description : "This service plan requires client support for asynchronous service operations." // TODO - This optional field is a user-facing message
            };

            status = 422;
        }
        // TODO - Else if the service instance is requested as asynchronous (and time is needed to update beyond the standard timeout)
        else if (ASYNC_SUPPORTED && acceptsIncomplete)
        {
            // TODO - Kick off your asynchronous work here

            result =
            {
                description : "This service instance is being updated asynchronously for you.", // TODO - This optional field is a user-facing message.
                operation   : "Test update" // Passed in on subsequent fetch requests
            };

            status = 202;
        }
        else
        {
            // TODO - Do your actual synchronous work here

            result = {};
            status = 200;
        }

        console.log("PATCH /v2/service_instances/%s?accepts_incomplete=%s status: %d, result: %j", instanceId, acceptsIncomplete, status, result);

        response.status(status).json(result); // Return 422 if this service instance does not support service plan update with result body including description field
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var fetch = function(request, response)
{
    var instanceId = request.params.instance_id;
    var operation  = request.query.operation;
    var planId     = request.query.plan_id;
    var serviceId  = request.query.service_id;

    console.log("GET /v2/service_instances/%s/last_operation?operation=%s&plan_id=%s&service_id=%s request headers: %j", instanceId, operation, planId, serviceId, request.headers);

    try
    {
        checkAccept(request, response);

        // TODO - Do your actual work here

        var state;
        var description;

        // TODO: If the asynchronous operation for this instance failed (hardcoded in the sample as false)
        if (false)
        {
            state       = "failed";
            description = "This asynchronous operation failed due to <some reason>"; // TODO - Provide failure message
        }
        // TODO - Else if the asynchronous operation for this instance is complete (hardcoded in the sample as true)
        else if (true)
        {
            state       = "succeeded";
            description = "This asynchronous operation is complete"; // TODO - This optional field is a user-facing message
        }
        else
        {
            state       = "in progress";
            description = "This asynchronous operation is xx% complete"; // TODO - This optional field is a user-facing message
        }

        result =
        {
            state       : state,
            description : description
        };

        console.log("GET /v2/service_instances/%s/last_operation?operation=%s&plan_id=%s&service_id=%s result: %j", instanceId, operation, planId, serviceId, result);

        response.status(200).json(result);
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var dashboard = function(request, response)
{
    var instanceId = request.params.instance_id;

    console.log("GET /dashboard/%s request headers: %j", instanceId, request.headers);

    try
    {
        var authorizationEndpointCallback = function(authorizationEndpointResult)
        {
            var redirectUri = authorizationEndpointResult                   + 
                              "?client_id=" + encodeURIComponent(CLIENT_ID) +
                              "&redirect_uri=" + getSSORedirectURI(request) + 
                              "&response_type=code"                         +
                              "&state=" + encodeURIComponent(instanceId); 
            
            console.log("Dashboard GET redirectURI: %s", redirectUri);

            response.redirect(redirectUri);
        };

        iamIdentityEndpoint(request, response, "authorization_endpoint", authorizationEndpointCallback);
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var sso_dashboard = function(request, response)
{
    var code  = request.query.code;
    var state = request.query.state;

    console.log("GET /sso_dashboard?code=%s&state=%s request headers: %j", code, state, request.headers);

    try
    {
        var manageServiceInstanceCallback = function(manageServiceInstanceResult)
        {
            if (manageServiceInstanceResult)
            {
                // TODO - Add your actual administrative page here instead of the string below
                response.send("You can manage this service instance");
            }
            else
            {
                response.status(401).send("You are not authorized to manage this service instance");
            }
        };

        var apiKeyTokenCallback = function(accessTokenResult, apiKeyTokenResult)
        {
            if (apiKeyTokenResult == null)
            {
                response.status(401).send("You are not authorized to manage this service instance");
            }
            else
            {
                manageServiceInstance(request, response, accessTokenResult, apiKeyTokenResult, state, manageServiceInstanceCallback);
            }
        };

        var accessTokenCallback = function(tokenEndpointResult, accessTokenResult)
        {
            if (accessTokenResult == null)
            {
                response.status(401).send("You are not authorized to manage this service instance");
            }
            else
            {
                apiKeyToken(request, response, accessTokenResult, apiKeyTokenCallback);
            }
        };

        var tokenEndpointCallback = function(tokenEndpointResult)
        {
            accessToken(request, response, tokenEndpointResult, code, accessTokenCallback);
        };

        iamIdentityEndpoint(request, response, "token_endpoint", tokenEndpointCallback);
    }
    catch(exception)
    {
        console.log(exception);
    }
};

/*
 * IBM Cloud Enablement Extension: enable service instance
 */
var enable = function(request, response)
{
    var instanceId = request.params.instance_id;

    console.log("PUT /bluemix_v1/service_instances/%s request headers: %j", instanceId, request.headers);

    try
    {
        checkContentType(request, response);

        var body = request.body;

        console.log("PUT /bluemix_v1/service_instances/%s body: %j", instanceId, body);

        var s    = JSON.stringify(request.body);
        var json = JSON.parse(s);

        var enabled    = getBoolean(json, "enabled", true, response);
        var intiatorId = getString(json, "initiator_id", true, response);
        var reasonCode = getString(json, "reason_code", true, response);

        // TODO - Do your actual work here

        response.sendStatus(204);
    }
    catch(exception)
    {
        console.log(exception);
    }
};

/*
 * IBM Cloud Enablement Extension: service instance state inquiry
 */
var state = function(request, response)
{
    var instanceId = request.params.instance_id;

    console.log("GET /bluemix_v1/service_instances/%s request headers: %j", instanceId, request.headers);

    try
    {
        checkAccept(request, response);

        var result = 
        {
            // true or false
            enabled : true,

            // true or false. Only meaningful if active is true. Defaults to true if not set.
            active  : true,

            // Last accessed/modified in milliseconds since the epoch. Only meaningful if enabled is true and active is false.
            // If enabled is true and active is false and this value is more than the number of days in the past identified by the PLM,
            // this is a reaping candidate. If enabled is true and active is false and this is not set, this is an immediate reaping candidate.
            last_active : new Date().getTime()
        };

        console.log("GET /bluemix_v1/service_instances/%s result: %j", instanceId, result);

        response.status(200).json(result);
    }
    catch(exception)
    {
        console.log(exception);
    }
};

var expressServer = express();

expressServer.enable("trust proxy");

expressServer.use(bodyParser.json());

// Set public folder for icon and documentation
expressServer.use(express.static(__dirname + "/public"));

// Get for testing. Not authenticated
expressServer.get("/", get);

// Authorization
var basicAuth = basicAuthConnect(SERVICE_BROKER_USER, SERVICE_BROKER_PASSWORD);

// Open Service Broker
expressServer.get("/v2/catalog", basicAuth, catalog);
expressServer.put("/v2/service_instances/:instance_id", basicAuth, provision);
expressServer.put("/v2/service_instances/:instance_id/service_bindings/:binding_id", basicAuth, bind);
expressServer.delete("/v2/service_instances/:instance_id/service_bindings/:binding_id", basicAuth, unbind);
expressServer.delete("/v2/service_instances/:instance_id", basicAuth, unprovision);
expressServer.patch("/v2/service_instances/:instance_id", basicAuth, update);
expressServer.get("/v2/service_instances/:instance_id/last_operation", basicAuth, fetch);

// Paths to handle dashboard SSO - not authenticated
expressServer.get("/dashboard/:instance_id", dashboard);
expressServer.get("/sso_dashboard", sso_dashboard);

// IBM Cloud Enablement Extensions
expressServer.put("/bluemix_v1/service_instances/:instance_id", basicAuth, enable);
expressServer.get("/bluemix_v1/service_instances/:instance_id", basicAuth, state);

/*
https.createServer(httpsOptions,
*/ 

expressServer.listen(PORT,
                     connected);
