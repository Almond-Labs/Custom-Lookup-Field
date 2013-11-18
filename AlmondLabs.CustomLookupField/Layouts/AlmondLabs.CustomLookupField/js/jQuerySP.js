(function ($) {
    if (!$.SP)
        $.SP = {};
    $.SP.get = function (apiUrl, options) {
        var def = {
            url: apiUrl,
            method: "GET",
            headers: { "accept": "application/json;odata=verbose" }
        };
        if (options)
            jQuery.extend(def, options);
        return jQuery.ajax(def);
    };
    $.SP.post = function (apiUrl, digest, data, options) {
        var def = {
            url: apiUrl,
            type: "POST",
            data: data ? data : null,
            processData: false,
            headers: {
                Accept: "application/json;odata=verbose",
                "X-RequestDigest": digest ? digest : ""/*,
                "Content-Length": data ?
                    (data.byteLength ? data.byteLength : data.length)
                    : null*/
            }
        };
        if (options)
            jQuery.extend(def, options);
        return jQuery.ajax(def);
    };
    $.SP.merge = function (apiUrl, digest, data, options) {
        var def = {
            url: apiUrl,
            type: "POST",
            data: JSON.stringify(data),
            headers: {
                Accept: "application/json;odata=verbose",
                "X-RequestDigest": digest ? digest : "",
                "X-HTTP-Method": "MERGE",
                "content-type": "application/json;odata=verbose",
                "IF-MATCH": "*"
            }
        };
        if (options)
            jQuery.extend(def, options);
        return jQuery.ajax(def);
    };
    $.SP.webServerRelativeUrl;
    $.SP.GetBaseUrl = function () {
        if (!$.SP.webServerRelativeUrl)
            $.SP.webServerRelativeUrl = _spPageContextInfo.webServerRelativeUrl.replace(/\/$/, "");

        return $.SP.webServerRelativeUrl;
    };
    $.SP.API = {
        GetLookupField: function (listId, fieldName) {
            var apiUrl = $.SP.GetBaseUrl() +
                    "/_api/lists(guid'" + listId + "')/Fields?$filter=StaticName eq '" +
                    fieldName + "'&$select=Id,LookupField,LookupWebId,LookupList,InternalName";
            return jQuery.SP.get(apiUrl);
        },
        GetItemModifiedEditor: function (listId, itemId) {
            var dfd = $.Deferred();
            var apiUrl = $.SP.GetBaseUrl() +
                    "/_api/lists(guid'" + listId + "')/Items(" + itemId + ")?$select=EditorId,Modified";
            $.SP.get(apiUrl).done(function (itemData) {
                var apiUrl = $.SP.webServerRelativeUrl + "/_api/Web/GetUserById(" + itemData.d.EditorId + ")?$select=Title";
                $.SP.get(apiUrl).done(function (editorData) {
                    dfd.resolve({
                        Modified: (new Date(Date.parse(itemData.d.Modified))).toLocaleDateString(),
                        Editor: editorData.d.Title
                    });
                });
            });

            return dfd.promise();
        },
        UploadFile: function (listId, filename, buffer) {
            var dfd = $.Deferred();
            jQuery.SP.post($.SP.GetBaseUrl() + "/_api/contextinfo").done(function (digest) {
                var formDigest = digest.d.GetContextWebInformation.FormDigestValue;
                var apiUrl = $.SP.GetBaseUrl() +
                    "/_api/lists(guid'" + listId + "')/RootFolder/Files/Add(url='" + filename + "', overwrite=true)";
                uploadOptions = {
                    xhr: function () {
                        var xhr = new window.XMLHttpRequest();
                        xhr.upload.addEventListener("progress", function (evt) {
                            if (evt.lengthComputable) {
                                var percentComplete = evt.loaded / evt.total;
                                //Do something with upload progress
                                dfd.notify(percentComplete);
                            }
                        }, false);
                        return xhr;
                    }
                };
                jQuery.SP.post(apiUrl, formDigest, buffer, uploadOptions).done(function (uploadData) {
                    jQuery.SP.get(uploadData.d.ListItemAllFields.__deferred.uri).done(function (getData) {
                        var postData = { __metadata: { "type": getData.d.__metadata.type }, Title: filename };
                        jQuery.SP.merge(getData.d.__metadata.uri, formDigest, postData).done(function () {
                            dfd.resolve({ lookupId: getData.d.Id, lookupValue: filename });
                        });
                    });
                });
            });

            return dfd.promise();
        },
        GetListDisplayForm: function (listId) {
            var dfd = $.Deferred();
            var apiUrl = $.SP.GetBaseUrl() + "/_api/lists(guid'" + listId + "')/Forms";
            //Ajax request to get forms data for the lookup list
            jQuery.SP.get(apiUrl).done(function (data) {
                for (var x = 0; x < data.d.results.length && data.d.results[x].FormType != 4; x++) { }
                if (x < data.d.results.length) {
                    dfd.resolve(data.d.results[x].ServerRelativeUrl);
                }
                else {
                    dfd.reject();
                }
            });

            return dfd.promise();
        },
        QueryListByField: function (listId, fieldName, filter) {
            var dfd = $.Deferred();
            var apiUrl = $.SP.GetBaseUrl() +
                "/_api/lists(guid'" + listId + "')/Items?$select=Title,Id&$filter=startswith(" + fieldName + ",'" + filter + "')";
            jQuery.SP.get(apiUrl).done(function (data) {
                dfd.resolve(data.d.results);
            });

            return dfd.promise();
        }
    };
}(jQuery));