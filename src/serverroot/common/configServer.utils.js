/*
 * Copyright (c) 2014 Juniper Networks, Inc. All rights reserved.
 */

var authApi = require('./auth.api');
var config = require('../../../config/config.global');
var commonUtils = require('../utils/common.utils');
var async = require('async');
var configApiServer = require('./configServer.api');

/**
 * @listProjectsAPIServer
 * private function
 * 1. Gets list of projects from API server
 */
function listProjectsAPIServer (error, projectLists, appData, callback)
{
    var projects   = {'projects':[]};
    var projectURL = '/projects';

    if (error) {
        callback(error, projects);
        return;
    }
    configApiServer.apiGet(projectURL, appData,
        function(error, data) {
        callback(error, data);
    });
}

/** 
 * @getProjectsFromApiServer
 * Private function
 * 1. Gets all the projects from Api Server based on either /domain or /project 
 */
function getProjectsFromApiServer (request, appData, callback)
{
    var reqURL = null;
    var projectList = {"projects": []};

    var domain = request.param('domain');
    if (null != domain) {
        reqURL = '/domain/' + domain;
    } else {
        reqURL = '/projects';
    }
    configApiServer.apiGet(reqURL, appData, function(err, data) {
        if ((null != err) || (null == data) || ((null != domain) &&
            ((null == data['domain']) || (null == data['domain']['projects'])))) {
            callback(err, projectList);
            return;
        }
        if (null == domain) {
            callback(err, data);
            return;
        }
        var list = data['domain']['projects'];
        var projCnt = list.length;
        for (var i = 0; i < projCnt; i++) {
            projectList['projects'][i] = {};
            projectList['projects'][i]['uuid'] = list[i]['uuid'];
            projectList['projects'][i]['fq_name'] = list[i]['to'];
        }
        callback(null, projectList);
    });
}

function getDomainsFromApiServer (appData, callback)
{
    var domainsURL = '/domains';
    configApiServer.apiGet(domainsURL, appData, function(error, data) {
        if ((null != error) || (null == data)) {
            callback(error, null);
        } else {
            callback(error, data);
        }
    });
}

function getTenantListAndSyncDomain (request, appData, callback)
{
    var domainObjs      = {'domains':[]};
    var tmpDomainObjs   = {};
    var domArr          = [];
    authApi.getTenantList(request, function(error, tenantList) {
        if ((null != error) || (null == tenantList) ||
            (null == tenantList['tenants'])) {
            callback(error, null, null, null);
            return;
        }
        var projCnt = tenantList['tenants'].length;
        for (var i = 0; i < projCnt; i++) {
            var domId = tenantList['tenants'][i]['domain_id'];
            if ((null != domId) && (false == authApi.isDefaultDomain(request, domId))) {
                domId =
                    commonUtils.convertUUIDToString(tenantList['tenants'][i]['domain_id']);
            }
            if ((null != domId) && (null == tmpDomainObjs[domId])) {
                domainObjs['domains'].push({'fq_name': [domId], 'uuid': domId});
                tmpDomainObjs[domId] = domId;
                if (false == authApi.isDefaultDomain(request, domId)) {
                    var domUrl = '/domain/' + domId;
                    commonUtils.createReqObj(domArr, domUrl,
                                             global.HTTP_REQUEST_GET, null,
                                             null, null, appData);
                }
            }
        }
        async.map(domArr,
                  commonUtils.getAPIServerResponse(configApiServer.apiGet,
                                                   true),
                  function(err, confData) {
            getDomainsFromApiServer(appData, function(err, domList) {
                if ((null != err) || (null == domList) || (null == domList['domains'])) {
                    callback(null, domainObjs, tenantList, domList);
                    return;
                }
                var allDomList = domList['domains'];
                var allDomCnt = allDomList.length;
                var domCnt = domainObjs['domains'].length;
                for (var i = 0; i < domCnt; i++) {
                    for (var j = 0; j < allDomCnt; j++) {
                        if ((true == 
                             authApi.isDefaultDomain(request, domainObjs['domains'][i]['uuid'])) &&
                            (allDomList[j]['fq_name'][0] == "default-domain")) {
                            /* NOTE: API Server does have default-domain, keystone
                             * for v3 as default, So we need to send
                             * default-domain, else while creating VN and others
                             * it fails, as fqname ['default', 'XXX'] does not
                             * exist
                             */
                            domainObjs['domains'][i]['fq_name'] =
                                allDomList[j]['fq_name'];
                            domainObjs['domains'][i]['uuid'] =
                                allDomList[j]['uuid'];
                            break;
                        }
                        if (domainObjs['domains'][i]['uuid'] ==
                            allDomList[j]['uuid']) {
                            domainObjs['domains'][i]['fq_name'] =
                                allDomList[j]['fq_name'];
                            break;
                        }
                    }
                }
                callback(null, domainObjs, tenantList, domList);
            });
        });
    });
}

exports.listProjectsAPIServer = listProjectsAPIServer;
exports.getProjectsFromApiServer = getProjectsFromApiServer;
exports.getTenantListAndSyncDomain = getTenantListAndSyncDomain;
exports.getDomainsFromApiServer = getDomainsFromApiServer;

