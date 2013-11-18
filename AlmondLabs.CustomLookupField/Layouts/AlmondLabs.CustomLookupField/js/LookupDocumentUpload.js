(function ($) {
    if( !$.SP )
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
        if( !$.SP.webServerRelativeUrl )
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

function LookupFieldModel(ctx, fieldName) {
    var self = this;
    self.Metadata = ko.observable();

    jQuery.SP.API.GetLookupField(ctx.listId, fieldName).done(function (data) {
        var fields = data.d.results ? data.d.results : data.d;
        var x; for (x = 0; x < fields.length && fields[x].InternalName != fieldName; x++) { }

        if (x < fields.length) {
            self.Metadata({
                FieldId: fields[x].Id,
                FieldName: fields[x].LookupField,
                TargetWebId: fields[x].LookupWebId,
                TargetListId: fields[x].LookupList.replace(/{|}/g, "")
            });
        }
    });
}

function LookupItemModel(ctx, fieldName) {
    var self = this;
    self.OriginalItem = ctx.CurrentItem;
    self.Id = ctx.CurrentItem.ID ? ctx.CurrentItem.ID : ctx.FormContext.itemAttributes.Id;
    self.Title = ctx.CurrentItem.Title;
    self.Data = ko.observableArray([]);
    self.Data.subscribe(function (newValue) {
        if (self.Field && self.Field.Metadata()) {
            for (var x = 0; x < newValue.length; x++) {
                if (!newValue[x].TargetItem())
                    self.LoadTargetItem(newValue[x]);
            }
        }
    });
    self.Field = new LookupFieldModel(ctx, fieldName);
    self.Field.Metadata.subscribe(function (newValue) {
        for (var x = 0; x < self.Data().length; x++) {
            self.LoadTargetItem(self.Data()[x]);
        }
    });

    self.LoadTargetItem = function (item) {
        jQuery.SP.API.GetItemModifiedEditor(self.Field.Metadata().TargetListId, item.lookupId).done(item.TargetItem);
    };

    self.ReadLookup = function (fieldName) {
        var value = self.OriginalItem[fieldName];
        return value instanceof Array ?
            value :
            self.ParseLookup(value);
    };

    self.ParseLookup = function (value) {
        var ret = new Array();
        var parts = value.split(";#");
        for (var x = 0; x < parts.length / 2 && value.length > 0; x++) {
            var obj = { lookupId: parts[x * 2], lookupValue: parts[x * 2 + 1] };
            ret[x] = obj;
        }

        return ret;
    };

    self.AddItem = function (item) {
        item.TargetItem = ko.observable();
        self.Data.push(item)
    }

    var data = self.ReadLookup(fieldName);
    for (var x = 0; x < data.length; x++) {
        var item = data[x];
        self.AddItem(item);
    }
}

function LookupDocumentUploadModel(ctx, fieldName, mode) {
    var self = this;
    self.FieldName = fieldName;
    self.Context = ko.observable();
    self.Item = ko.observable();
    self.ContainerId = ko.computed(function () {
        if (self.Context() && self.Item())
            return self.Context().listId + "_" + self.Item().Id;

        return null;
    });
    self.FileInputId = ko.computed(function () {
        if (self.ContainerId())
            return "input_" + self.ContainerId();

        return null;
    });
    self.Mode = ko.observable("Display");
    self.FileInputValue = ko.observableArray();
    self.FileInputValue.subscribe(function (newValue) {
        var files = document.getElementById(self.FileInputId()).files;
        self.FilesToUpload.removeAll();
        for (var x = 0; x < files.length; x++) {
            files[x].UploadProgress = ko.observable();
            self.FilesToUpload.push(files[x]);
        }
    });
    self.FilesToUpload = ko.observableArray();

    self.LookupSearchValue = ko.observable();
    self.LookupSearchValue.subscribe(function (newValue) {
        if (newValue && newValue.length > 0) {
            jQuery.SP.API.QueryListByField(self.Item().Field.Metadata().TargetListId, self.Item().Field.Metadata().FieldName, newValue).done(function (results) {
                self.LookupSearchResults(results);
            });
        }
        else {
            self.LookupSearchResults.removeAll();
        }
    });
    self.LookupSearchResults = ko.observableArray();

    self.AddSearchItem = function (item) {
        self.Item().AddItem({ lookupId: item.Id, lookupValue: item[self.Item().Field.Metadata().FieldName] });
        self.LookupSearchValue("");
    };

    self.BrowseClick = function () {
        $("#" + self.FileInputId()).click();
    };

    self.ShowTargetDocument = function (targetItem) {
        jQuery.SP.API.GetListDisplayForm(self.Item().Field.Metadata().TargetListId).done(function (formUrl) {
            var options = {
                title: targetItem.lookupValue, url: formUrl + "?ID=" + targetItem.lookupId, width: 500, height: 500, allowMaximize: true, showClose: true, dialogReturnValueCallback: function (dialogResult, returnValue) {
                    //SP.SOD.execute('sp.ui.dialog.js', 'SP.UI.ModalDialog.RefreshPage', SP.UI.DialogResult.OK);
                }
            };

            SP.SOD.execute('sp.ui.dialog.js', 'SP.UI.ModalDialog.showModalDialog', options);
        });
    };

    self.UploadFiles = function () {
        if (!window.FileReader) {
            alert("Nope");
            return;
        }

        for (var x = 0; x < self.FilesToUpload().length; x++) {
            self.UploadFile( self.FilesToUpload()[x] );
        }
    };

    self.UploadFile = function (file, buffer) {
        if (!buffer) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.UploadFile(file, e.target.result);
            }
            reader.onerror = function (e) {
                alert(e.target.error);
            }
            reader.readAsArrayBuffer(file);
            return;
        }

        jQuery.SP.API.UploadFile(self.Item().Field.Metadata().TargetListId, file.name, buffer).progress(function(percentComplete) {
            file.UploadProgress(percentComplete);
        }).done(function (data) {
            self.FilesToUpload.remove(file);
            data.TargetItem = ko.observable();
            self.Item().AddItem(data);
        });
    };

    self.IsFirefox = ko.observable(typeof InstallTrigger !== 'undefined');

    self.Bound = false;
    self.Bind = function () {
        if (!self.Bound && self.ContainerId()) {
            self.Bound = true;
            var elem = document.getElementById(self.ContainerId());
            jQuery(elem).load("/_layouts/15/AlmondLabs.CustomLookupField/ko/LookupDocumentUpload.html", function () {
                ko.applyBindings(self, elem);
            });
        }
    };

    self.Save = function () {
        var ret = new Array();
        for (var x = 0; x < self.Item().Data().length; x++) {
            var item = self.Item().Data()[x];
            ret[x] = item.lookupId + ";#" + item.lookupValue;
        }
        return ret.join(";#");
    };

    self.LoadContext = function (ctx) {
        ctx.listId = ctx.listName ? ctx.listName.replace(/{|}/g, "") : ctx.FormContext.listAttributes.Id;
        self.Context(ctx);
        self.Item(new LookupItemModel(ctx, self.FieldName));
    };

    self.ToggleDisplayItems = function (model, event) {
        var elem = event.originalEvent.srcElement;
        $(elem).parent().parent().children(".DisplayItems").toggle(100);
    };

    self.RemoveItem = function (item) {
        self.Item().Data.remove(item);
    };

    self.toString = function () {
        return "<div id='" + self.ContainerId() + "'></div>";
    };

    self.LoadContext(ctx);
    self.Mode(mode);
    if (mode == "Edit") {
        var formCtx = SPClientTemplates.Utility.GetFormContextForCurrentField(ctx);
        formCtx.registerGetValueCallback(formCtx.fieldName, self.Save);
    }
}

//Register view callbacks
(function () {
    var pageModels = new Array();
    var fieldName = "LookupDocumentUpload";

    function View(ctx) {
        pageModels[pageModels.length] = new LookupDocumentUploadModel(ctx, fieldName, "View");
        return pageModels[pageModels.length - 1];
    };
    function Display(ctx) {
        pageModels[pageModels.length] = new LookupDocumentUploadModel(ctx, fieldName, "Display");
        return pageModels[pageModels.length - 1];
    };
    function Edit(ctx) {
        pageModels[pageModels.length] = new LookupDocumentUploadModel(ctx, fieldName, "Edit");
        return pageModels[pageModels.length - 1];
    }

    if (typeof SPClientTemplates === 'undefined')
        return;

    var fieldCtx = {};
    fieldCtx.OnPostRender = function (ctx) {
        for( var x=0; x<pageModels.length; x++ ) {
            pageModels[x].Bind();
        }
    };
    fieldCtx.Templates = {};
    fieldCtx.Templates.Fields = {
        'LookupDocumentUpload': {
            'View': View,
            'DisplayForm': Display,
            'EditForm': Edit,
            'NewForm': Edit
        }
    };

    SPClientTemplates.TemplateManager.RegisterTemplateOverrides(fieldCtx);
})();