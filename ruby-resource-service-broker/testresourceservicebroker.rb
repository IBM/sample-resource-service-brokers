# Sample IBM Cloud Ruby Sinatra Resource Service Broker.

require 'base64'
require 'cgi'
require 'json'
require 'logger'
require 'net/http'
require 'sinatra'
require 'time'
require 'uri'
require 'uuidtools'
require 'webrick'
require 'webrick/https'
require 'webrick/version'

webrick_options =
  {
    DoNotReverseLookup: true,
    Host:               '0.0.0.0',
    # Logger:             WEBrick::Log::new($stderr, WEBrick::Log::DEBUG),
    Port:               ENV['PORT'] || 3000,
    ServerSoftware:     "WEBrick/#{WEBrick::VERSION} (Ruby/#{RUBY_VERSION}/#{RUBY_RELEASE_DATE})", # Default value includes OpenSSL version which is a security exposure
    SSLEnable:          false
    # SSLCertificate:     cert,
    # SSLPrivateKey:      pkey,
    # SSLCertName:        cert_name
  }

# TODO: This service name must be unique within an IBM Cloud environment's set of service offerings
SERVICE_NAME = 'testrubyresourceservicebrokername'.freeze

# TODO: Change your basic authentication credentials
SERVICE_BROKER_USER     = 'TestServiceBrokerUser'.freeze
SERVICE_BROKER_PASSWORD = 'TestServiceBrokerPassword'.freeze

# TODO: Change your client secret
CLIENT_ID     = SERVICE_NAME.freeze
CLIENT_SECRET = ''.freeze

# TODO: Change your API key value
API_KEY = ''.freeze

# TODO: Whether asynchronous operations are supported or not
ASYNC_SUPPORTED = false

# TODO: If asynchronous operation is required due to time requirements
ASYNC_REQUIRED = false

# TODO: Whether service keys are supported or not
SERVICE_KEYS_SUPPORTED = true

IAM_ENDPOINT          = 'https://iam.cloud.ibm.com'.freeze
IAM_IDENTITY_ENDPOINT = "#{IAM_ENDPOINT}/identity/.well-known/openid-configuration".freeze

class TestServiceBroker < Sinatra::Base
  # TODO: Syncing STDOUT so it will not buffer.
  STDOUT.sync = true
  LOGGER = Logger.new(STDOUT)
  LOGGER.level = Logger::DEBUG

  configure do
    # Turn off frame_options protection so IBM Console can launch an admin page for this service
    # Turn off path traversal protection so resource controller can pass path with encoded slash
    set :protection, except: %i[frame_options path_traversal]

    # Set public folder for icon
    set :public_folder, 'public'
  end

  # GET for testing. Not invoked by IBM Cloud.
  get '/' do
    LOGGER.debug("GET / request: #{request.inspect}")
    'This is a test'
  end

  get '/v2/catalog' do
    LOGGER.debug("GET /v2/catalog request: #{request.inspect}")

    check_authorization

    check_accept

    originating_identity = get_originating_identity
    LOGGER.debug("GET /v2/catalog originating identity: #{originating_identity.inspect}")

    result =
      {
        services:
        [
          {
            bindable:         true,
            description:      'Test Ruby Resource Service Broker Description',
            # TODO: GUID generated by http://www.guidgenerator.com.
            # TODO: This service id must be unique within an IBM Cloud environment's set of service offerings
            id:               '19f08e05-b872-4e0e-9fc8-2ebdddcb4b88',
            metadata:
            {
              displayName:          'Test Ruby Resource Service Broker Display Name',
              documentationUrl:     "#{request.base_url}/documentation.html",
              imageUrl:             "#{request.base_url}/services.svg", # Copied from https://github.com/carbon-design-system/carbon-icons/blob/master/src/svg/services.svg
              instructionsUrl:      "#{request.base_url}/instructions.html",
              longDescription:      'Test Ruby Resource Service Broker Long Description',
              providerDisplayName:  'Company Name',
              supportUrl:           "#{request.base_url}/support.html",
              termsUrl:             "#{request.base_url}/terms.html"
            },
            name:             SERVICE_NAME,
            # TODO: Ensure this value is accurate for your service. Requires PATCH of /v2/service_instances/:instance_id below if true
            plan_updateable:  true,
            tags:             %w[lite tag1a tag1b],
            plans:
            [
              {
                bindable:    true,
                description: 'Test Ruby Resource Service Broker Plan Description',
                free:        true,
                # TODO: GUID generated by http://www.guidgenerator.com.
                # TODO: This service plan id must be unique within an IBM Cloud environment's set of service plans
                id:          'ebc5cd57-7a91-4cee-85c2-80f7950cb068',
                metadata:
                {
                  bullets:     ['Test bullet 1', 'Test bullet 2'],
                  displayName: 'Lite'
                },
                # TODO: This service plan name must be unique within the containing service definition
                name:        'lite'
              }
            ]
          }
        ]
      }

    LOGGER.debug("GET /v2/catalog result: #{result.inspect}")

    content_type(:json)
    body(result.to_json)
    status(200)
  end

  # Provision service instance
  put '/v2/service_instances/:instance_id' do
    instance_id        = params[:instance_id]
    accepts_incomplete = params[:accepts_incomplete] == 'true'

    LOGGER.debug("PUT /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} request: #{request.inspect}")

    check_authorization

    check_media_type
    check_accept

    originating_identity = get_originating_identity
    LOGGER.debug("PUT /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} originating identity: #{originating_identity.inspect}")

    body = request.body.read

    LOGGER.debug("PUT /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} body: #{body.inspect}")

    begin
      json = JSON.parse(body)

      context    = get_hash(json, 'context')
      parameters = get_hash(json, 'parameters', false) # Optional
      plan_id    = get_string(json, 'plan_id')
      service_id = get_string(json, 'service_id')

      platform = get_string(context, 'platform')

      # IBM Cloud context fields
      account_id         = nil
      crn                = nil
      resource_group_crn = nil
      target_crn         = nil

      if platform == 'ibmcloud'
        # Retrieve the various IBM Cloud-specific context fields
        account_id         = get_string(context, 'account_id')
        crn                = get_string(context, 'crn')
        resource_group_crn = get_string(context, 'resource_group_crn')
        target_crn         = get_string(context, 'target_crn')
      end

      result = nil
      status = nil

      # If the service only supports asynchronous operations and accepts_incomplete is not true
      if ASYNC_SUPPORTED && ASYNC_REQUIRED && !accepts_incomplete
        result =
          {
            error:       'AsyncRequired',
            description: 'This service plan requires client support for asynchronous service operations.' # TODO: This optional field is a user-facing message
          }.to_json

        status = 422
      else
        dashboard_url = "https://#{env['HTTP_HOST']}/dashboard/#{CGI.escape(instance_id)}"

        # TODO: If the service instance is requested as asynchronous (and time is needed to provision beyond the standard timeout)
        if ASYNC_SUPPORTED && accepts_incomplete
          # TODO: Kick off your asynchronous work here

          result =
            {
              dashboard_url: dashboard_url,
              description:   'This service instance is being created asynchronously for you', # TODO: This optional field is a user-facing message.
              operation:     'Test provision' # Passed in on subsequent fetch requests
            }.to_json

          status = 202
        else
          # TODO: Do your actual synchronous work here

          result =
            {
              dashboard_url: dashboard_url
            }.to_json

          # Created response, but does not expect URL
          status = 201
        end
      end

      LOGGER.debug("PUT /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} status: #{status}, result: #{result.inspect}")

      content_type(:json)
      body(result)
      status(status) # Return 409 if already provisioned at this url
    rescue JSON::ParserError
      LOGGER.debug('Invalid JSON payload')
      content_type(:json)
      body({ description: 'Invalid JSON payload' }.to_json)
      status(400)
    end
  end

  # Bind service instance
  put '/v2/service_instances/:instance_id/service_bindings/:binding_id' do
    instance_id = params[:instance_id]
    binding_id  = params[:binding_id]

    LOGGER.debug("PUT /v2/service_instances/#{instance_id}/service_bindings/#{binding_id} request: #{request.inspect}")

    check_authorization

    check_media_type
    check_accept

    originating_identity = get_originating_identity
    LOGGER.debug("PUT /v2/service_instances/#{instance_id}/service_bindings/#{binding_id} originating identity: #{originating_identity.inspect}")

    body = request.body.read

    LOGGER.debug("PUT /v2/service_instances/#{instance_id}/service_bindings/#{binding_id} body: #{body.inspect}")

    begin
      json = JSON.parse(body)

      bind_resource = get_hash(json, 'bind_resource', false) # Not required if for service_key
      context       = get_hash(json, 'context', false) # Not available until OSB 2.13
      parameters    = get_hash(json, 'parameters', false) # Optional
      plan_id       = get_string(json, 'plan_id')
      service_id    = get_string(json, 'service_id')

      app_guid = nil

      unless bind_resource.nil?
        app_guid = get_string(bind_resource, 'app_guid', false) # Only required if binding app to service instance
      end

      unless context.nil?
        platform = get_string(context, 'platform')

        if platform == 'ibmcloud'
          # Retrieve the various IBM Cloud-specific context fields here
        end
      end

      result = nil
      status = nil

      # If app_guid not provided and service keys are not supported
      if app_guid.nil? && !SERVICE_KEYS_SUPPORTED
        result =
          {
            error:       'RequiresApp',
            description: 'This service supports generation of credentials through binding an application only.' # TODO: This optional field is a user-facing message
          }.to_json

        status = 422
      else
        # TODO: Do your actual work here

        # Example credentials
        generated_userid   = UUIDTools::UUID.random_create.to_s
        generated_password = UUIDTools::UUID.random_create.to_s

        result =
          {
            credentials:
            {
              userid:   generated_userid,
              password: generated_password
            }
          }.to_json

        # Created response, but does not expect URL
        status = 201
      end

      LOGGER.debug("PUT /v2/service_instances/#{instance_id}/service_bindings/#{binding_id} status: #{status}, result: #{result.inspect}")

      content_type(:json)
      body(result)
      status(status) # Return 409 if already bound at this url
    rescue JSON::ParserError
      LOGGER.debug('Invalid JSON payload')
      content_type(:json)
      body({ description: 'Invalid JSON payload' }.to_json)
      status(400)
    end
  end

  delete '/v2/service_instances/:instance_id/service_bindings/:binding_id' do
    instance_id = params[:instance_id]
    binding_id  = params[:binding_id]
    plan_id     = params[:plan_id]
    service_id  = params[:service_id]

    LOGGER.debug("DELETE /v2/service_instances/#{instance_id}/service_bindings/#{binding_id}?plan_id=#{plan_id}&service_id=#{service_id} request: #{request.inspect}")

    check_authorization

    check_accept

    originating_identity = get_originating_identity
    LOGGER.debug("DELETE /v2/service_instances/#{instance_id}/service_bindings/#{binding_id}?plan_id=#{plan_id}&service_id=#{service_id} originating identity: #{originating_identity.inspect}")

    # TODO: Do your actual work here

    result = {}.to_json

    LOGGER.debug("DELETE /v2/service_instances/#{instance_id}/service_bindings/#{binding_id}?plan_id=#{plan_id}&service_id=#{service_id} result: #{result.inspect}")

    content_type(:json)
    body(result)
    status(200) # Return 410 with body of {} if previously deleted
  end

  delete '/v2/service_instances/:instance_id' do
    instance_id        = params[:instance_id]
    accepts_incomplete = params[:accepts_incomplete] == 'true'
    plan_id            = params[:plan_id]
    service_id         = params[:service_id]

    LOGGER.debug("DELETE /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete}&plan_id=#{plan_id}&service_id=#{service_id} request: #{request.inspect}")

    check_authorization

    check_accept

    originating_identity = get_originating_identity
    LOGGER.debug("DELETE /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete}&plan_id=#{plan_id}&service_id=#{service_id} originating identity: #{originating_identity.inspect}")

    result = nil
    status = nil

    # If the service only supports asynchronous operations and accepts_incomplete is not true
    if ASYNC_SUPPORTED && ASYNC_REQUIRED && !accepts_incomplete
      result =
        {
          error:       'AsyncRequired',
          description: 'This service plan requires client support for asynchronous service operations.' # TODO: This optional field is a user-facing message
        }.to_json

      status = 422
    # TODO: Else if the service instance is requested as asynchronous (and time is needed to deprovision beyond the standard timeout)
    elsif ASYNC_SUPPORTED && accepts_incomplete
      # TODO: Kick off your asynchronous work here

      result =
        {
          description: 'This service instance is being deleted asynchronously for you.', # TODO: This optional field is a user-facing message.
          operation:   'Test deprovision' # Passed in on subsequent fetch requests
        }.to_json

      status = 202
    else
      # TODO: Do your actual synchronous work here

      result = {}.to_json
      status = 200
    end

    LOGGER.debug("DELETE /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete}&plan_id=#{plan_id}&service_id=#{service_id} status: #{status}, result: #{result.inspect}")

    content_type(:json)
    body(result)
    status(status) # Return 410 with body of {} if previously deleted
  end

  # Update service instance's service plan
  patch '/v2/service_instances/:instance_id/?' do
    instance_id        = params[:instance_id]
    accepts_incomplete = params[:accepts_incomplete] == 'true'

    LOGGER.debug("PATCH /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} request: #{request.inspect}")

    check_authorization

    check_media_type
    check_accept

    originating_identity = get_originating_identity
    LOGGER.debug("PATCH /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} originating identity: #{originating_identity.inspect}")

    body = request.body.read

    LOGGER.debug("PATCH /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} body: #{body.inspect}")

    begin
      json = JSON.parse(body)

      context          = get_hash(json, 'context')
      parameters       = get_hash(json, 'parameters', false) # Optional
      service_id       = get_string(json, 'service_id')
      plan_id          = get_string(json, 'plan_id', false) # Optional
      previous_values  = get_hash(json, 'previous_values', false) # Optional

      previous_plan_id = nil

      if previous_values
        previous_plan_id = get_string(previous_values, 'plan_id')
      end

      platform = get_string(context, 'platform')

      # IBM Cloud context fields
      account_id         = nil
      crn                = nil
      resource_group_crn = nil
      target_crn         = nil

      if platform == 'ibmcloud'
        # Retrieve the various IBM Cloud-specific context fields
        account_id         = get_string(context, 'account_id')
        crn                = get_string(context, 'crn')
        resource_group_crn = get_string(context, 'resource_group_crn')
        target_crn         = get_string(context, 'target_crn')
      end

      result = nil
      status = nil

      # If the service only supports asynchronous operations and accepts_incomplete is not true
      if ASYNC_SUPPORTED && ASYNC_REQUIRED && !accepts_incomplete
        result =
          {
            error:       'AsyncRequired',
            description: 'This service plan requires client support for asynchronous service operations.' # TODO: This optional field is a user-facing message
          }.to_json

        status = 422
      # TODO: Else if the service instance is requested as asynchronous (and time is needed to update beyond the standard timeout)
      elsif ASYNC_SUPPORTED && accepts_incomplete
        # TODO: Kick off your asynchronous work here

        result =
          {
            description: 'This service instance is being updated asynchronously for you.', # TODO: This optional field is a user-facing message.
            operation:   'Test update' # Passed in on subsequent fetch requests
          }.to_json

        status = 202
      else
        # TODO: Do your actual synchronous work here

        result = {}.to_json

        status = 200
      end

      LOGGER.debug("PATCH /v2/service_instances/#{instance_id}?accepts_incomplete=#{accepts_incomplete} status: #{status}, result: #{result.inspect}")

      content_type(:json)
      body(result)
      status(status) # Return 422 if this service instance does not support service plan update with result body including description field
    rescue JSON::ParserError
      LOGGER.debug('Invalid JSON payload')
      content_type(:json)
      body({ description: 'Invalid JSON payload' }.to_json)
      status(400)
    end
  end

  get '/v2/service_instances/:instance_id/last_operation' do
    instance_id = params[:instance_id]
    operation   = params[:operation]
    plan_id     = params[:plan_id]
    service_id  = params[:service_id]

    LOGGER.debug("GET /v2/service_instances/#{instance_id}/last_operation?operation=#{operation}&plan_id=#{plan_id}&service_id=#{service_id} request: #{request.inspect}")

    check_authorization

    check_accept

    # TODO: Do your actual work here

    state       = nil
    description = nil

    # TODO: If the asynchronous operation for this instance failed (hardcoded in the sample as false)
    if false
      state       = 'failed'
      description = 'This asynchronous operation failed due to <some reason>' # TODO: Provide failure message
    # TODO: Else if the asynchronous operation for this instance is complete (hardcoded in the sample as true)
    elsif true
      state       = 'succeeded'
      description = 'This asynchronous operation is complete' # TODO: This optional field is a user-facing message
    else
      state       = 'in progress'
      description = 'This asynchronous operation is xx% complete' # TODO: This optional field is a user-facing message
    end

    result =
      {
        state:       state,
        description: description
      }.to_json

    LOGGER.debug("GET /v2/service_instances/#{instance_id}/last_operation?operation=#{operation}&plan_id=#{plan_id}&service_id=#{service_id} result: #{result.inspect}")

    content_type(:json)
    body(result)
    status(200) # Return 410 with body of {} if previously deleted
  end

  get '/dashboard/:instance_id' do
    instance_id = params[:instance_id]

    LOGGER.debug("GET /dashboard/#{instance_id} request: #{request.inspect}")

    uri = "#{iam_identity_endpoint('authorization_endpoint')}?client_id=#{CGI.escape(CLIENT_ID)}&redirect_uri=#{redirect_uri}&response_type=code&state=#{CGI.escape(instance_id)}"

    LOGGER.debug("GET /dashboard/#{instance_id} redirect uri: #{uri}")

    redirect uri, 302
  end

  get '/sso_dashboard' do
    code  = params[:code]
    state = params[:state]

    LOGGER.debug("GET /sso_dashboard?code=#{code}&state=#{state} request: #{request.inspect}")

    token_endpoint = iam_identity_endpoint('token_endpoint')
    access_token   = access_token(token_endpoint, code)
    api_key_token  = api_key_token()

    content_type(:html)
    if access_token && api_key_token && manage_service_instance?(access_token, api_key_token, state)
      # TODO: Add your actual administrative page here instead of the string below
      body('You can manage this service instance')
      status(200)
    else
      body('You are not authorized to manage this service instance')
      status(401)
    end
  end

  # IBM Cloud Enablement Extension: enable service instance
  put '/bluemix_v1/service_instances/:instance_id' do
    instance_id = params[:instance_id]

    LOGGER.debug("PUT /bluemix_v1/service_instances/#{instance_id} request: #{request.inspect}")

    check_authorization

    check_media_type

    body = request.body.read

    LOGGER.debug("PUT /bluemix_v1/service_instances/#{instance_id} body: #{body.inspect}")

    begin
      json = JSON.parse(body)

      enabled      = get_boolean(json, 'enabled')
      initiator_id = get_string(json, 'initiator_id', false) # Optional
      reason_code  = get_string(json, 'reason_code', false) # Optional

      # TODO: Do your actual work here

      status 204
    rescue JSON::ParserError
      LOGGER.debug('Invalid JSON payload')
      content_type(:json)
      body({ description: 'Invalid JSON payload' }.to_json)
      status(400)
    end
  end

  # IBM Cloud Enablement Extension: service instance state inquiry
  get '/bluemix_v1/service_instances/:instance_id' do
    instance_id = params[:instance_id]

    LOGGER.debug("GET /bluemix_v1/service_instances/#{instance_id}, request: #{request.inspect}")

    check_authorization

    check_accept

    result =
      {
        # true or false
        enabled: true,

        # true or false. Only meaningful if active is true. Defaults to true if not set.
        active: true,

        # Last accessed/modified in milliseconds since the epoch. Only meaningful if enabled is true and active is false.
        # If enabled is true and active is false and this value is more than the number of days in the past identified by the PLM,
        # this is a reaping candidate. If enabled is true and active is false and this is not set, this is an immediate reaping candidate.
        last_active: (Time.now.to_f * 1000).to_i
      }

    LOGGER.debug("GET /bluemix_v1/service_instances/#{instance_id} result: #{result.inspect}")

    content_type(:json)
    body(result.to_json)
    status(200)
  end

  private

  def check_authorization
    return if authorized?

    headers['WWW-Authenticate'] = 'Basic realm="Restricted Area"'
    halt(401, { description: 'Not authorized' }.to_json)
  end

  def authorized?
    auth = Rack::Auth::Basic::Request.new(request.env)

    auth.provided? &&
      auth.basic? &&
      auth.credentials &&
      auth.credentials == [SERVICE_BROKER_USER, SERVICE_BROKER_PASSWORD]
  end

  def check_media_type
    return if request.media_type == 'application/json'

    msg = 'Content-Type must be application/json'
    LOGGER.debug(msg)
    halt(415, { description: msg }.to_json)
  end

  def check_accept
    return if request.accept?('application/json')

    msg = 'Accept type must be application/json'
    LOGGER.debug(msg)
    halt(406, { description: msg }.to_json)
  end

  def get_originating_identity
    originating_identity = env['HTTP_X_BROKER_API_ORIGINATING_IDENTITY']
    return {} if originating_identity.nil?

    strings  = originating_identity.split(' ')
    platform = strings[0]
    value    = JSON.parse(Base64.decode64(strings[1]))

    {
      platform: platform,
      value:    value
    }
  end

  def get_object(json, name, required)
    object = json[name]

    if required && object.nil?
      msg = "#{name} not found in JSON payload"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    object
  end

  def get_boolean(json, name, required = true)
    boolean = get_object(json, name, required)

    return nil if boolean.nil?

    return true if boolean == true
    return false if boolean == false

    msg = "#{name} must be a boolean"
    LOGGER.debug(msg)
    halt(400, { description: msg }.to_json)
  end

  def get_hash(json, name, required = true)
    hash = get_object(json, name, required)

    return nil if hash.nil?

    unless hash.is_a?(Hash)
      msg = "#{name} must be a Hash"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    hash
  end

  def get_hash_array_entry(json, name, index, required = true)
    array = get_object(json, name, required)

    return nil if array.nil?

    unless array.is_a?(Array)
      msg = "#{name} must be an Array"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    unless array.length > index
      msg = "#{name} must be an Array of at least length #{index + 1}"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    array_entry = array[index]

    unless array_entry.is_a?(Hash)
      msg = "#{name} must be an Array of Hash"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    array_entry
  end

  def get_string(json, name, required = true)
    string = get_object(json, name, required)

    return nil if string.nil?

    unless string.is_a?(String)
      msg = "#{name} must be a String"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    if required && string.strip.empty?
      msg = "#{name} cannot be empty"
      LOGGER.debug(msg)
      halt(400, { description: msg }.to_json)
    end

    string
  end

  def redirect_uri
    "https://#{env['HTTP_HOST']}/sso_dashboard"
  end

  def do_http(url_string, http_method, authorization = nil, user = nil, password = nil, content_type = nil, content = nil)
    uri = URI.parse(url_string)

    http         = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme.to_s.casecmp('https').zero?
    request      = http_method.new(uri.path)

    request['Accept']        = 'application/json'
    request['Authorization'] = authorization unless authorization.nil?
    request['Content-Type']  = content_type unless content_type.nil?
    request.body             = content unless content.nil?
    request.basic_auth(user, password) unless user.nil? || password.nil?

    response = http.request(request)

    if response.is_a?(Net::HTTPOK)
      begin
        LOGGER.debug("Successful #{http_method} from #{uri}. Request: #{request.inspect}, request body: #{request.body}, response #{response.inspect}, response.body #{response.body}")
        JSON.parse(response.body)
      rescue JSON::ParserError
        LOGGER.debug("Unable to parse JSON retrieved from #{uri}. Request: #{request.inspect}, request body: #{request.body}, response #{response.inspect}, response.body #{response.body}")
        halt(500, { description: "Information retrieved from #{uri} is invalid" }.to_json)
      end
    elsif response.is_a?(Net::HTTPBadRequest)
      LOGGER.debug("Bad request from #{uri}. Request: #{request.inspect}, request body: #{request.body}, response #{response.inspect}, response.body #{response.body}")
      nil
    elsif response.is_a?(Net::HTTPUnauthorized)
      LOGGER.debug("Unauthorized from #{uri}. Request: #{request.inspect}, request body: #{request.body}, response #{response.inspect}, response.body #{response.body}")
      nil
    elsif response.is_a?(Net::HTTPForbidden)
      LOGGER.debug("Forbidden from #{uri}. Request: #{request.inspect}, request body: #{request.body}, response #{response.inspect}, response.body #{response.body}")
      nil
    elsif response.is_a?(Net::HTTPNotFound)
      LOGGER.debug("Not found retrieved from #{uri}. Request: #{request.inspect}, request body: #{request.body}, response #{response.inspect}")
      nil
    else
      LOGGER.debug("Unable to access #{uri}. Request: #{request.inspect}, request body: #{request.body}, response: #{response.inspect}, response body: #{response.body}")
      halt(response.code.to_i, { description: response.message }.to_json)
    end
  end

  def iam_identity_endpoint(endpoint)
    json = do_http(IAM_IDENTITY_ENDPOINT, Net::HTTP::Get)

    if json.nil?
      msg = "Unable to GET from #{IAM_IDENTITY_ENDPOINT}"
      LOGGER.debug(msg)
      halt(500, { description: msg }.to_json)
    end

    get_string(json, endpoint)
  end

  def access_token(token_endpoint, code)
    content = URI.encode_www_form('client_id'     => CLIENT_ID,
                                  'client_secret' => CLIENT_SECRET,
                                  'code'          => code,
                                  'grant_type'    => 'authorization_code',
                                  'redirect_uri'  => redirect_uri,
                                  'response_type' => 'cloud_iam')

    json = do_http(token_endpoint, Net::HTTP::Post, nil, CLIENT_ID, CLIENT_SECRET, 'application/x-www-form-urlencoded', content)

    return nil if json.nil?

    access_token = get_string(json, 'access_token')

    LOGGER.debug("access_token: #{access_token}")

    access_token
  end

  def api_key_token
    url_string = "#{IAM_ENDPOINT}/identity/token"

    content = URI.encode_www_form('apikey'        => API_KEY,
                                  'grant_type'    => 'urn:ibm:params:oauth:grant-type:apikey',
                                  'response_type' => 'cloud_iam')

    json = do_http(url_string, Net::HTTP::Post, nil, nil, nil, 'application/x-www-form-urlencoded', content)

    return nil if json.nil?

    access_token = get_string(json, 'access_token')

    LOGGER.debug("api_key_token: #{access_token}")

    access_token
  end

  def manage_service_instance?(access_token, api_key_token, instance_id)
    access_token_body_json = JSON.parse(Base64.decode64(access_token.split('.')[1]))
    LOGGER.debug("Decoded access token body: #{access_token_body_json}")

    iam_id  = get_string(access_token_body_json, 'iam_id')
    scope   = get_string(access_token_body_json, 'scope')

    url_string = "#{IAM_ENDPOINT}/v2/authz"

    content =
      [
        {
          subject:
          {
            attributes:
            {
              id:    iam_id,
              scope: scope
            }
          },
          resource:
          {
            crn: instance_id
          },
          action: "#{SERVICE_NAME}.dashboard.view"
        }
      ].to_json

    LOGGER.debug("manage_service_instance content: #{content}")

    json = do_http(url_string, Net::HTTP::Post, api_key_token, nil, nil, 'application/json', content)
    return false if json.nil?

    array_entry = get_hash_array_entry(json, 'responses', 0)
    status      = get_string(array_entry, 'status')

    if status != '200'
      LOGGER.debug("Unable to retrieve /v2/authz. Got status: #{status}")
      halt(500, { description: 'Unable to retrieve /v2/authz' }.to_json)
    end

    authorization_decision = get_hash(array_entry, 'authorizationDecision')
    get_boolean(authorization_decision, 'permitted')
  rescue JWT::DecodeError
    msg = 'Unable to decode IAM user access token'
    LOGGER.debug(msg)
    halt(500, { description: msg }.to_json)
  end
end

%w[TERM INT].each { |sig| trap(sig) { exit! } }

Rack::Handler::WEBrick.run(TestServiceBroker, **webrick_options)
